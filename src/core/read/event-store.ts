import {
  type NostrEvent,
  computeEventId,
  isNostrEvent,
  verifyEvent,
} from "../nostr/event";
import type { RelayUrl } from "../relay/relay-connection";
import { type Scheduler, defaultScheduler } from "./connection-pool";
import type { EventPersistence, PersistedEvent } from "./event-persistence";

/** NIP-09 の削除依頼イベント。対象は `e` / `a` タグで運ばれる。 */
const DELETION_KIND = 5;
const HEX_64 = /^[0-9a-f]{64}$/;
const CANONICAL_DECIMAL = /^(?:0|[1-9]\d*)$/;

export type StoredEvent = {
  event: NostrEvent;
  seenRelays: RelayUrl[];
  /**
   * `put()` が呼ばれた時刻 (ミリ秒エポック)。`event.created_at` は著者が
   * 書いた時刻であって、こちらは我々が取得した時刻 —— 鮮度判定
   * (staleMs との比較) はこちらでなければ、2 年前に書かれた kind:0 を
   * 今取得しても常に stale と判定されてしまう。
   */
  fetchedAt: number;
};

export type PutResult = "inserted" | "duplicate" | "rejected" | "hidden";

export type ReplaceableChange = {
  kind: number;
  pubkey: string;
  /** addressable event の `d`。通常の置換可能イベントでは省略する。 */
  identifier?: string;
};

export type EventStoreChange =
  | { type: "insert"; event: NostrEvent }
  | { type: "remove"; event: NostrEvent }
  | { type: "hide"; event: NostrEvent }
  | { type: "show"; event: NostrEvent };

export type EventStoreOptions = {
  scheduler?: Scheduler;
  /**
   * 背後の水和・退避層 (ADR-0018)。渡さなければ永続化しない (デバッグ
   * ルート・ほとんどのユニットテストの既定)。`routing-table.ts` のコメント
   * が前提にしている「kind:10002 を普通のイベントとして保存すれば
   * ルーティング表の永続化は自動的に得られる」を実際に成立させているのが
   * ここ —— put() が挿入・restamp のたびに転送する。
   */
  persistence?: EventPersistence;
};

type ReplaceableAddress = {
  kind: number;
  pubkey: string;
  identifier?: string;
};

const isRegularReplaceableKind = (kind: number): boolean =>
  kind === 0 || kind === 3 || (kind >= 10_000 && kind < 20_000);

const isAddressableKind = (kind: number): boolean =>
  kind >= 30_000 && kind < 40_000;

const firstDTag = (event: NostrEvent): string | undefined =>
  event.tags.find((tag) => tag[0] === "d")?.[1];

/** `d` 自体に `:` が入っても衝突しない replacement key。 */
const replacementKey = (address: ReplaceableAddress): string =>
  JSON.stringify([
    address.kind,
    address.pubkey,
    ...(address.identifier === undefined ? [] : [address.identifier]),
  ]);

const deletionEventTargetIds = (deletion: NostrEvent): string[] => [
  ...new Set(
    deletion.tags
      .filter(
        (tag): tag is [string, string] =>
          tag[0] === "e" && typeof tag[1] === "string" && HEX_64.test(tag[1]),
      )
      .map((tag) => tag[1]),
  ),
];

const parseDeletionAddress = (
  raw: string,
  author: string,
): ReplaceableAddress | undefined => {
  const firstColon = raw.indexOf(":");
  const secondColon = raw.indexOf(":", firstColon + 1);
  if (firstColon <= 0 || secondColon < 0) return undefined;
  const rawKind = raw.slice(0, firstColon);
  if (!CANONICAL_DECIMAL.test(rawKind)) return undefined;
  const kind = Number(rawKind);
  const pubkey = raw.slice(firstColon + 1, secondColon);
  if (
    !Number.isInteger(kind) ||
    !isAddressableKind(kind) ||
    !HEX_64.test(pubkey) ||
    pubkey !== author
  ) {
    return undefined;
  }
  return { kind, pubkey, identifier: raw.slice(secondColon + 1) };
};

const deletionAddressTargets = (deletion: NostrEvent): ReplaceableAddress[] => {
  const unique = new Map<string, ReplaceableAddress>();
  for (const tag of deletion.tags) {
    if (tag[0] !== "a" || typeof tag[1] !== "string") continue;
    const address = parseDeletionAddress(tag[1], deletion.pubkey);
    if (address) unique.set(replacementKey(address), address);
  }
  return [...unique.values()];
};

const addressForEvent = (event: NostrEvent): ReplaceableAddress | undefined => {
  if (isRegularReplaceableKind(event.kind)) {
    return { kind: event.kind, pubkey: event.pubkey };
  }
  if (isAddressableKind(event.kind)) {
    // `d` が無い壊れた event も空 identifier へ隔離し、別の `d` の最新版を
    // 上書きさせない。正常な書き込みは Writer が `d` を必ず付ける。
    return {
      kind: event.kind,
      pubkey: event.pubkey,
      identifier: firstDTag(event) ?? "",
    };
  }
  return undefined;
};

const addressForLookup = (
  kind: number,
  pubkey: string,
  identifier: string | undefined,
): ReplaceableAddress => {
  if (isRegularReplaceableKind(kind)) {
    if (identifier !== undefined) {
      throw new Error("通常の置換可能イベントに identifier は指定できません");
    }
    return { kind, pubkey };
  }
  if (isAddressableKind(kind)) {
    if (identifier === undefined) {
      throw new Error("addressable event には identifier が必要です");
    }
    return { kind, pubkey, identifier };
  }
  throw new Error(`kind:${kind} は置換可能イベントではありません`);
};

/**
 * 同期・メモリのイベント保管。
 * IndexedDB による永続化は後続の計画で「背後の水和・退避層」として足す (ADR-0018)。
 */
export class EventStore {
  readonly #events = new Map<string, StoredEvent>();
  /** 削除依頼が無くなれば同じ取得情報のまま戻せる、非公開の本体。 */
  readonly #hiddenEvents = new Map<string, StoredEvent>();
  readonly #deletionRequests = new Map<string, NostrEvent>();
  readonly #deletionsByEvent = new Map<string, Set<string>>();
  readonly #deletionsByAddress = new Map<string, Set<string>>();
  /** 構造化した replacement address → 最新イベントの id */
  readonly #replaceable = new Map<string, string>();
  /**
   * タグの値 → そのタグを持つイベント id。
   *
   * **単一文字のタグだけを索引する。** NIP-01 がリレーの索引対象をそう定めて
   * おり、`#e` / `#p` のフィルタが成立する根拠でもある。`imeta` のような
   * 長いタグまで索引すると、誰も引かない索引でメモリを食う。
   */
  readonly #byTag = new Map<string, Map<string, Set<string>>>();
  readonly #scheduler: Scheduler;
  readonly #persistence: EventPersistence | undefined;
  readonly #replaceableListeners = new Set<
    (change: ReplaceableChange) => void
  >();
  readonly #changeListeners = new Set<(change: EventStoreChange) => void>();

  #verifyMs = 0;
  #verifyCount = 0;

  constructor(options: EventStoreOptions = {}) {
    this.#scheduler = options.scheduler ?? defaultScheduler;
    this.#persistence = options.persistence;
  }

  get size(): number {
    return this.#events.size + this.#hiddenEvents.size;
  }

  /**
   * `verifyEvent` (id 再計算 + schnorr) にこれまで費やした累計 ms と回数。
   *
   * ADR-0011 の「初回イベント表示 2 秒」に対して、検証がどれだけを占めて
   * いるかを分解するための値。初回バーストでは数百件が一度に流れるため、
   * 1 件あたりが速くても合計は無視できない。重複判定で弾かれた分は含めない
   * (そちらは検証していない)。
   *
   * `performance.now()` を注入せず直に呼ぶ。読み取り層がタイマーを
   * `Scheduler` 経由にしているのは、テストが時間を決定的に進めるためで
   * あって、時刻の取得一般を禁じているからではない。この値は表示にしか
   * 使わず、どの分岐にも影響しない。
   */
  get verifyMs(): number {
    return this.#verifyMs;
  }

  get verifyCount(): number {
    return this.#verifyCount;
  }

  /**
   * 最新の置換可能イベントが変わったことを購読する。
   *
   * イベントそのものを渡さないのは、listener が処理を始める時点では同じ
   * key のさらに新しい版が入っている可能性があるため。通知は再読込の契機
   * だけを表し、値は `latestReplaceable()` から読む。
   */
  onReplaceableChanged(
    listener: (change: ReplaceableChange) => void,
  ): () => void {
    this.#replaceableListeners.add(listener);
    return () => this.#replaceableListeners.delete(listener);
  }

  /**
   * イベントの追加・削除を購読する。通知は再読込の契機だけを表し、kind の
   * 意味は持たない。リアクション等の解釈は `eventsByTag` を読む側へ置く。
   */
  subscribe(listener: (change: EventStoreChange) => void): () => void {
    this.#changeListeners.add(listener);
    return () => this.#changeListeners.delete(listener);
  }

  put(event: NostrEvent, relay: RelayUrl): PutResult {
    const visible = this.#events.get(event.id);
    const existing = visible ?? this.#hiddenEvents.get(event.id);
    if (existing) {
      // 重複 id を主張するだけの偽装ペイロードにリレーの功績を与えない。
      // schnorr 検証はしない (Outbox で同一イベントが複数リレーから届き、
      // 重複のたびに払うにはコストが高すぎる)。id の再計算だけで足りる。
      const { id, sig, ...unsigned } = event;
      if (isNostrEvent(event) && computeEventId(unsigned) === id) {
        // 同一イベントの再配送は「まだ現在のままだ」という確認そのもの。
        // これで restamp しないと、著者が長期間更新しない置換可能イベント
        // (kind:10002 など) は初回取得時刻に固定され続け、staleMs を過ぎる
        // たびに再取得され、しかも二度と鮮度が回復しない。
        existing.fetchedAt = this.#scheduler.now();
        if (!existing.seenRelays.includes(relay)) {
          existing.seenRelays.push(relay);
        }
        // 著者が変えていない置換可能イベント (kind:10002 など) は毎回
        // "duplicate" で戻ってくる。ここで転送しないと、永続層の fetchedAt
        // が初回取得時刻のまま固定され、次回起動のたびに (実際には新鮮な
        // ものまで) stale と誤判定されて取り直しが永久に止まらない。
        this.#persist(existing);
      }
      return visible ? "duplicate" : "hidden";
    }

    // リレーは信用できない。全件検証する。
    const startedAt = performance.now();
    const verified = verifyEvent(event);
    this.#verifyMs += performance.now() - startedAt;
    this.#verifyCount += 1;
    if (!verified) return "rejected";

    const fetchedAt = this.#scheduler.now();
    if (event.kind !== DELETION_KIND && this.#isHiddenByDeletion(event)) {
      const stored = { event, seenRelays: [relay], fetchedAt };
      this.#hiddenEvents.set(event.id, stored);
      this.#persist(stored);
      return "hidden";
    }
    this.#insert(event, [relay], fetchedAt);
    const stored = this.#events.get(event.id);
    if (stored) this.#persist(stored);
    if (event.kind === DELETION_KIND) this.#addDeletionRequest(event, true);
    return "inserted";
  }

  /** `retention`（`none`/`latest-per-author`/`capped`）の適用は永続層の責務 (spec 7 節) —— ここは無条件に転送するだけでよい。 */
  #persist(stored: StoredEvent): void {
    this.#persistence?.save([
      {
        event: stored.event,
        seenRelays: [...stored.seenRelays],
        fetchedAt: stored.fetchedAt,
      },
    ]);
  }

  /**
   * 永続層から読み戻したものを検証せずに入れる。`put()` の枝ではなく別の
   * メソッドにしているのは、リレー由来の値がこの無検証の経路へ迷い込む
   * 余地を型シグネチャの時点で無くすため —— 呼び出せるのは
   * `readonly PersistedEvent[]` を持っている側だけで、`RelayConnection` の
   * イベントハンドラはこの形を作れない。
   *
   * `fetchedAt` は引数の値をそのまま使う。ここで現在時刻を入れると水和の
   * たびに全件が新鮮になり、`staleMs` が二度と発火しなくなる。
   *
   * 既にある id は上書きしない —— 起動後にリレーから届いた新しい版を、
   * 後から終わる水和が古い値で巻き戻すことになる。
   */
  hydrate(
    entries: readonly PersistedEvent[],
    options?: { deletionRequests?: readonly NostrEvent[] },
  ): void {
    for (const deletion of options?.deletionRequests ?? []) {
      if (
        deletion.kind !== DELETION_KIND ||
        !isNostrEvent(deletion) ||
        this.#events.has(deletion.id)
      ) {
        continue;
      }
      this.#insert(deletion, [], 0);
      this.#addDeletionRequest(deletion, false);
    }
    for (const entry of entries) {
      if (
        this.#events.has(entry.event.id) ||
        this.#hiddenEvents.has(entry.event.id)
      ) {
        continue;
      }
      // 永続層のデータは壊れていることがある (スキーマ変更、部分書き込み)。
      // 署名までは検証しない (信用済み挿入の前提そのもの) が、形だけは確かめる。
      if (!isNostrEvent(entry.event)) continue;

      if (
        entry.event.kind !== DELETION_KIND &&
        this.#isHiddenByDeletion(entry.event)
      ) {
        this.#hiddenEvents.set(entry.event.id, {
          event: entry.event,
          seenRelays: [...entry.seenRelays],
          fetchedAt: entry.fetchedAt,
        });
      } else {
        this.#insert(entry.event, [...entry.seenRelays], entry.fetchedAt);
        if (entry.event.kind === DELETION_KIND) {
          this.#addDeletionRequest(entry.event, false);
        }
      }
    }
  }

  #insert(event: NostrEvent, seenRelays: RelayUrl[], fetchedAt: number): void {
    this.#events.set(event.id, { event, seenRelays, fetchedAt });
    const replaceableChanged = this.#indexReplaceable(event);
    this.#indexTags(event);
    if (replaceableChanged) this.#notifyReplaceableChanged(event);
    this.#notifyChanged({ type: "insert", event });
  }

  #addDeletionRequest(deletion: NostrEvent, persist: boolean): void {
    if (this.#deletionRequests.has(deletion.id)) return;
    this.#deletionRequests.set(deletion.id, deletion);

    const directTargets = deletionEventTargetIds(deletion);
    for (const targetId of directTargets) {
      this.#addDeletionIndex(this.#deletionsByEvent, targetId, deletion.id);
      const target = this.#events.get(targetId)?.event;
      if (target && this.#deletionApplies(deletion, target)) {
        this.#hide(target.id);
      }
    }

    const addresses = deletionAddressTargets(deletion);
    for (const address of addresses) {
      const key = replacementKey(address);
      this.#addDeletionIndex(this.#deletionsByAddress, key, deletion.id);
    }
    // address ごとに全件走査すると、1 つの削除依頼へ a タグを増やすだけで
    // O(addresses × events) になる。索引を先に全部作り、本体は一度だけ見る。
    if (addresses.length > 0) {
      for (const { event } of [...this.#events.values()]) {
        if (this.#deletionApplies(deletion, event)) this.#hide(event.id);
      }
    }

    if (persist) this.#persistence?.saveDeletionRequest(deletion);
  }

  #addDeletionIndex(
    index: Map<string, Set<string>>,
    target: string,
    deletionId: string,
  ): void {
    const ids = index.get(target) ?? new Set<string>();
    ids.add(deletionId);
    index.set(target, ids);
  }

  #removeDeletionIndex(
    index: Map<string, Set<string>>,
    target: string,
    deletionId: string,
  ): void {
    const ids = index.get(target);
    if (!ids) return;
    ids.delete(deletionId);
    if (ids.size === 0) index.delete(target);
  }

  #deletionApplies(deletion: NostrEvent, target: NostrEvent): boolean {
    if (target.kind === DELETION_KIND || target.pubkey !== deletion.pubkey) {
      return false;
    }
    if (deletionEventTargetIds(deletion).includes(target.id)) return true;
    const targetAddress = addressForEvent(target);
    if (!targetAddress || !isAddressableKind(target.kind)) return false;
    return deletionAddressTargets(deletion).some(
      (address) =>
        replacementKey(address) === replacementKey(targetAddress) &&
        target.created_at <= deletion.created_at,
    );
  }

  #isHiddenByDeletion(event: NostrEvent): boolean {
    if (event.kind === DELETION_KIND) return false;
    const requestIds = new Set(this.#deletionsByEvent.get(event.id) ?? []);
    const address = addressForEvent(event);
    if (address && isAddressableKind(event.kind)) {
      for (const id of this.#deletionsByAddress.get(replacementKey(address)) ??
        []) {
        requestIds.add(id);
      }
    }
    for (const id of requestIds) {
      const deletion = this.#deletionRequests.get(id);
      if (deletion && this.#deletionApplies(deletion, event)) return true;
    }
    return false;
  }

  #hide(id: string): void {
    const stored = this.#events.get(id);
    if (!stored || stored.event.kind === DELETION_KIND) return;
    this.#events.delete(id);
    this.#removeVisibleIndexes(stored.event);
    this.#hiddenEvents.set(id, stored);
    this.#notifyChanged({ type: "hide", event: stored.event });
  }

  #show(id: string): void {
    const stored = this.#hiddenEvents.get(id);
    if (!stored || this.#isHiddenByDeletion(stored.event)) return;
    this.#hiddenEvents.delete(id);
    this.#events.set(id, stored);
    const replaceableChanged = this.#indexReplaceable(stored.event);
    this.#indexTags(stored.event);
    if (replaceableChanged) this.#notifyReplaceableChanged(stored.event);
    this.#notifyChanged({ type: "show", event: stored.event });
  }

  #removeDeletionRequest(deletion: NostrEvent): void {
    if (!this.#deletionRequests.delete(deletion.id)) return;
    const affected = new Set<string>();
    for (const targetId of deletionEventTargetIds(deletion)) {
      this.#removeDeletionIndex(this.#deletionsByEvent, targetId, deletion.id);
      affected.add(targetId);
    }
    const addressKeys = new Set(
      deletionAddressTargets(deletion).map(replacementKey),
    );
    for (const key of addressKeys) {
      this.#removeDeletionIndex(this.#deletionsByAddress, key, deletion.id);
    }
    if (addressKeys.size > 0) {
      for (const [id, { event }] of this.#hiddenEvents) {
        const address = addressForEvent(event);
        if (address && addressKeys.has(replacementKey(address)))
          affected.add(id);
      }
    }
    this.#persistence?.deleteDeletionRequest(deletion.id);
    for (const id of affected) this.#show(id);
  }

  isHidden(id: string): boolean {
    return this.#hiddenEvents.has(id);
  }

  get(id: string): NostrEvent | undefined {
    return this.#events.get(id)?.event;
  }

  seenRelays(id: string): RelayUrl[] {
    return [...(this.#events.get(id)?.seenRelays ?? [])];
  }

  fetchedAt(id: string): number | undefined {
    return this.#events.get(id)?.fetchedAt;
  }

  replaceableFetchedAt(
    kind: number,
    pubkey: string,
    identifier?: string,
  ): number | undefined {
    const id = this.#replaceable.get(
      replacementKey(addressForLookup(kind, pubkey, identifier)),
    );
    return id ? this.fetchedAt(id) : undefined;
  }

  /**
   * 取得時刻だけを 0 に戻し、イベント自体は残す。丸ごと消すと
   * 「持っていない」になり、serveWhileRevalidating を許すポリシーの kind が
   * 再取得の間に出すべき古い値を失う。
   */
  invalidate(kind: number, pubkey: string, identifier?: string): void {
    const id = this.#replaceable.get(
      replacementKey(addressForLookup(kind, pubkey, identifier)),
    );
    if (!id) return;
    const stored = this.#events.get(id);
    if (!stored) return;
    stored.fetchedAt = 0;
  }

  /**
   * 通常の置換可能イベントと addressable event の最新版を索引する。
   * ルーティング表 (ADR-0016) はこの索引から kind:10002 を導出する。
   */
  #indexReplaceable(event: NostrEvent): boolean {
    const address = addressForEvent(event);
    if (!address) return false;

    const key = replacementKey(address);
    const currentId = this.#replaceable.get(key);
    const current = currentId ? this.#events.get(currentId)?.event : undefined;
    if (current) {
      // 同一 pubkey の複数版が届くリレーが実在する (purplepag.es で最大4版)。
      // created_at 最大の版を採る (ADR-0016)。同着の場合は NIP-01 の規定どおり
      // id を辞書式に比較し、小さい方を残す (nostr-protocol/nips 01.md:101)。
      // 到着順ではなく id で決めることで、リレーの配送順に左右されない
      // 決定的な結果にする。
      if (current.created_at > event.created_at) return false;
      if (current.created_at === event.created_at && current.id <= event.id) {
        return false;
      }
    }
    this.#replaceable.set(key, event.id);
    return true;
  }

  #notifyReplaceableChanged(event: NostrEvent): void {
    const address = addressForEvent(event);
    if (!address) return;
    const change: ReplaceableChange = address;
    for (const listener of [...this.#replaceableListeners]) {
      try {
        listener(change);
      } catch (error) {
        console.error(
          "EventStore: an onReplaceableChanged listener threw; isolating it so the remaining listeners keep receiving notifications.",
          error,
        );
      }
    }
  }

  #notifyChanged(change: EventStoreChange): void {
    for (const listener of [...this.#changeListeners]) {
      try {
        listener(change);
      } catch (error) {
        console.error(
          "EventStore: a change listener threw; isolating it so the remaining listeners keep receiving notifications.",
          error,
        );
      }
    }
  }

  #removeVisibleIndexes(event: NostrEvent): void {
    for (const tag of event.tags) {
      const name = tag[0];
      const value = tag[1];
      if (!name || name.length !== 1 || !value) continue;
      const byValue = this.#byTag.get(name);
      const ids = byValue?.get(value);
      if (!ids || !byValue) continue;
      ids.delete(event.id);
      if (ids.size === 0) byValue.delete(value);
      if (byValue.size === 0) this.#byTag.delete(name);
    }

    const address = addressForEvent(event);
    const key = address ? replacementKey(address) : undefined;
    if (!key || this.#replaceable.get(key) !== event.id) return;
    this.#replaceable.delete(key);
    for (const candidate of this.#events.values()) {
      const candidateAddress = addressForEvent(candidate.event);
      if (!candidateAddress) continue;
      if (replacementKey(candidateAddress) !== key) continue;
      this.#indexReplaceable(candidate.event);
    }
    this.#notifyReplaceableChanged(event);
  }

  #indexTags(event: NostrEvent): void {
    for (const tag of event.tags) {
      const name = tag[0];
      const value = tag[1];
      if (!name || name.length !== 1 || !value) continue;
      let byValue = this.#byTag.get(name);
      if (!byValue) {
        byValue = new Map();
        this.#byTag.set(name, byValue);
      }
      let ids = byValue.get(value);
      if (!ids) {
        ids = new Set();
        byValue.set(value, ids);
      }
      ids.add(event.id);
    }
  }

  /**
   * このタグ値を持つイベント。意味づけ (kind:7 の `e` はリアクション先である、
   * など) は呼び出し側が与える —— ここは kind を一切知らない。
   */
  eventsByTag(name: string, value: string): NostrEvent[] {
    const ids = this.#byTag.get(name)?.get(value);
    if (!ids) return [];
    const events: NostrEvent[] = [];
    for (const id of ids) {
      const stored = this.#events.get(id);
      if (stored) events.push(stored.event);
    }
    return events;
  }

  /**
   * 索引から完全に外す。`invalidate()` (取得時刻だけ 0 に戻し、値は残す)
   * とは別物。
   *
   * 使う場所は 2 つ。publish が 1 本も通らなかった書き込みの巻き戻し
   * (`src/core/write/writer.ts`) と、自分のイベントを NIP-09 で削除した
   * ときのローカル反映。どちらも「このイベントは無かったことにする」
   * であり、serveWhileRevalidating が古い値を出す余地は要らない。
   */
  remove(id: string): boolean {
    const visible = this.#events.get(id);
    const stored = visible ?? this.#hiddenEvents.get(id);
    if (!stored) return false;
    const { event } = stored;
    if (visible) {
      this.#events.delete(id);
      this.#removeVisibleIndexes(event);
    } else {
      this.#hiddenEvents.delete(id);
    }

    this.#persistence?.delete([id]);
    this.#notifyChanged({ type: "remove", event });
    if (event.kind === DELETION_KIND) this.#removeDeletionRequest(event);
    return true;
  }

  latestReplaceable(
    kind: number,
    pubkey: string,
    identifier?: string,
  ): NostrEvent | undefined {
    const id = this.#replaceable.get(
      replacementKey(addressForLookup(kind, pubkey, identifier)),
    );
    return id ? this.get(id) : undefined;
  }
}
