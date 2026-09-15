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
   * `created_at` は著者が書いた時刻なので、鮮度判定にはこちらの取得時刻を使う。
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
   * 渡さなければ永続化しない。`put()` が挿入と restamp のたびに転送するので、
   * kind:10002 を普通のイベントとして保存するだけでルーティング表も永続化される。
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
 * IndexedDB による永続化は「背後の水和・退避層」として足す。
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
  /** イベントが無い応答も、置換可能イベントを取得済みとして記録する。 */
  readonly #replaceableFetchedAt = new Map<string, number>();
  /**
   * タグの値 → そのタグを持つイベント id。単一文字のタグだけを索引する
   * (NIP-01 のリレー索引対象と同じ) —— 長いタグまで索引すると無駄にメモリを食う。
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
   * `verifyEvent` の累計 ms と回数。「初回表示 2 秒」予算の検証コスト内訳
   * 用。表示専用で分岐に影響しないため `performance.now()` を直に呼ぶ。
   */
  get verifyMs(): number {
    return this.#verifyMs;
  }

  get verifyCount(): number {
    return this.#verifyCount;
  }

  /**
   * 最新の置換可能イベントが変わったことを購読する。イベント自体は渡さない
   * —— listener 実行時にはさらに新しい版が入りうるため、値は `latestReplaceable()` から読む。
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

  /** `retention`（`none`/`latest-per-author`/`capped`）の適用は永続層の責務 —— ここは無条件に転送するだけでよい。 */
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
   * 永続層データを検証せず入れる (未検証データの迷い込みを型で防ぐため
   * `put()` と別メソッド)。`fetchedAt` は引数の値のまま使い、既存 id は上書きしない。
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
      // 永続層のデータは壊れうる。署名検証はしない (信用済み挿入の前提) が形は確かめる。
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
    const key = replacementKey(addressForLookup(kind, pubkey, identifier));
    const id = this.#replaceable.get(key);
    return id ? this.fetchedAt(id) : this.#replaceableFetchedAt.get(key);
  }

  /**
   * EOSE まで待って対象が無かった場合も、次の要求がすぐ投げ直さないよう
   * 取得時刻を残す。イベント本体が届けばそちらの `fetchedAt` を優先する。
   */
  markReplaceableFetched(
    kind: number,
    pubkey: string,
    identifier?: string,
  ): void {
    const key = replacementKey(addressForLookup(kind, pubkey, identifier));
    this.#replaceableFetchedAt.set(key, this.#scheduler.now());
  }

  /**
   * 取得時刻だけ 0 に戻し、イベントは残す。丸ごと消すと「持っていない」に
   * なり、serveWhileRevalidating が再取得中に出すべき古い値を失う。
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
   * ルーティング表はこの索引から kind:10002 を導出する。
   */
  #indexReplaceable(event: NostrEvent): boolean {
    const address = addressForEvent(event);
    if (!address) return false;

    const key = replacementKey(address);
    const currentId = this.#replaceable.get(key);
    const current = currentId ? this.#events.get(currentId)?.event : undefined;
    if (current) {
      // 同一 pubkey の複数版が届くリレーが実在するため、created_at 最大を
      // 採る。同着は NIP-01 どおり id 辞書式最小を残し、配送順に左右されない。
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
   * 索引から完全に外す (`invalidate()` とは別物)。使うのは publish 全滅の
   * 巻き戻しと NIP-09 の自己削除の 2 箇所で、serveWhileRevalidating の余地は無い。
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
