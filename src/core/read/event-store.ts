import {
  type NostrEvent,
  computeEventId,
  isNostrEvent,
  verifyEvent,
} from "../nostr/event";
import type { RelayUrl } from "../relay/relay-connection";
import { type Scheduler, defaultScheduler } from "./connection-pool";
import type { EventPersistence, PersistedEvent } from "./event-persistence";

/** NIP-09。削除指示の対象は `e` タグで運ばれる。 */
const DELETION_KIND = 5;

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

export type PutResult = "inserted" | "duplicate" | "rejected";

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

/**
 * 同期・メモリのイベント保管。
 * IndexedDB による永続化は後続の計画で「背後の水和・退避層」として足す (ADR-0018)。
 */
export class EventStore {
  readonly #events = new Map<string, StoredEvent>();
  /** `${kind}:${pubkey}` → 最新の置換可能イベントの id */
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

  #verifyMs = 0;
  #verifyCount = 0;

  constructor(options: EventStoreOptions = {}) {
    this.#scheduler = options.scheduler ?? defaultScheduler;
    this.#persistence = options.persistence;
  }

  get size(): number {
    return this.#events.size;
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

  put(event: NostrEvent, relay: RelayUrl): PutResult {
    const existing = this.#events.get(event.id);
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
      return "duplicate";
    }

    // リレーは信用できない。全件検証する。
    const startedAt = performance.now();
    const verified = verifyEvent(event);
    this.#verifyMs += performance.now() - startedAt;
    this.#verifyCount += 1;
    if (!verified) return "rejected";

    const fetchedAt = this.#scheduler.now();
    this.#insert(event, [relay], fetchedAt);
    const stored = this.#events.get(event.id);
    if (stored) this.#persist(stored);
    if (event.kind === DELETION_KIND) this.#persistDeletion(event);
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
   * NIP-09 の `e` タグが指す対象 id を保持期間の対象にせず記録する
   * (ADR-0019)。このスライスではイベント本体をまだ永続化しないので
   * 実効は無いが、後から本体の水和を足すスライスがここを新設せずに済む
   * ようにする (spec 10 節)。
   */
  #persistDeletion(deletion: NostrEvent): void {
    const targetIds = deletion.tags
      .filter(
        (tag): tag is [string, string] =>
          tag[0] === "e" && typeof tag[1] === "string",
      )
      .map((tag) => tag[1]);
    if (targetIds.length > 0) this.#persistence?.saveDeletions(targetIds);
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
    options?: { deletedIds?: readonly string[] },
  ): void {
    const deletedIds = new Set(options?.deletedIds ?? []);
    for (const entry of entries) {
      if (deletedIds.has(entry.event.id)) continue;
      if (this.#events.has(entry.event.id)) continue;
      // 永続層のデータは壊れていることがある (スキーマ変更、部分書き込み)。
      // 署名までは検証しない (信用済み挿入の前提そのもの) が、形だけは確かめる。
      if (!isNostrEvent(entry.event)) continue;

      this.#insert(entry.event, [...entry.seenRelays], entry.fetchedAt);
    }
  }

  #insert(event: NostrEvent, seenRelays: RelayUrl[], fetchedAt: number): void {
    this.#events.set(event.id, { event, seenRelays, fetchedAt });
    this.#indexReplaceable(event);
    this.#indexTags(event);
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

  replaceableFetchedAt(kind: number, pubkey: string): number | undefined {
    const id = this.#replaceable.get(`${kind}:${pubkey}`);
    return id ? this.fetchedAt(id) : undefined;
  }

  /**
   * 取得時刻だけを 0 に戻し、イベント自体は残す。丸ごと消すと
   * 「持っていない」になり、serveWhileRevalidating を許すポリシーの kind が
   * 再取得の間に出すべき古い値を失う。
   */
  invalidate(kind: number, pubkey: string): void {
    const id = this.#replaceable.get(`${kind}:${pubkey}`);
    if (!id) return;
    const stored = this.#events.get(id);
    if (!stored) return;
    stored.fetchedAt = 0;
  }

  /**
   * 置換可能イベント (10000-19999) と、kind:0 / kind:3 の最新版を索引する。
   * ルーティング表 (ADR-0016) はこの索引から kind:10002 を導出する。
   */
  #indexReplaceable(event: NostrEvent): void {
    // 置換可能イベントの kind 範囲 (nostr-protocol/nips 01.md:97)。
    const replaceable =
      event.kind === 0 ||
      event.kind === 3 ||
      (event.kind >= 10000 && event.kind < 20000);
    if (!replaceable) return;

    const key = `${event.kind}:${event.pubkey}`;
    const currentId = this.#replaceable.get(key);
    const current = currentId ? this.#events.get(currentId)?.event : undefined;
    if (current) {
      // 同一 pubkey の複数版が届くリレーが実在する (purplepag.es で最大4版)。
      // created_at 最大の版を採る (ADR-0016)。同着の場合は NIP-01 の規定どおり
      // id を辞書式に比較し、小さい方を残す (nostr-protocol/nips 01.md:101)。
      // 到着順ではなく id で決めることで、リレーの配送順に左右されない
      // 決定的な結果にする。
      if (current.created_at > event.created_at) return;
      if (current.created_at === event.created_at && current.id <= event.id) {
        return;
      }
    }
    this.#replaceable.set(key, event.id);
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

  latestReplaceable(kind: number, pubkey: string): NostrEvent | undefined {
    const id = this.#replaceable.get(`${kind}:${pubkey}`);
    return id ? this.get(id) : undefined;
  }
}
