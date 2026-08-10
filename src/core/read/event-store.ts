import {
  type NostrEvent,
  computeEventId,
  isNostrEvent,
  verifyEvent,
} from "../nostr/event";
import type { RelayUrl } from "../relay/relay-connection";
import { type Scheduler, defaultScheduler } from "./connection-pool";

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
};

/**
 * 同期・メモリのイベント保管。
 * IndexedDB による永続化は後続の計画で「背後の水和・退避層」として足す (ADR-0018)。
 */
export class EventStore {
  readonly #events = new Map<string, StoredEvent>();
  /** `${kind}:${pubkey}` → 最新の置換可能イベントの id */
  readonly #replaceable = new Map<string, string>();
  readonly #scheduler: Scheduler;

  #verifyMs = 0;
  #verifyCount = 0;

  constructor(options: EventStoreOptions = {}) {
    this.#scheduler = options.scheduler ?? defaultScheduler;
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
      }
      return "duplicate";
    }

    // リレーは信用できない。全件検証する。
    const startedAt = performance.now();
    const verified = verifyEvent(event);
    this.#verifyMs += performance.now() - startedAt;
    this.#verifyCount += 1;
    if (!verified) return "rejected";

    this.#events.set(event.id, {
      event,
      seenRelays: [relay],
      fetchedAt: this.#scheduler.now(),
    });
    this.#indexReplaceable(event);
    return "inserted";
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

  latestReplaceable(kind: number, pubkey: string): NostrEvent | undefined {
    const id = this.#replaceable.get(`${kind}:${pubkey}`);
    return id ? this.get(id) : undefined;
  }
}
