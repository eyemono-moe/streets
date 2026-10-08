import type { NostrEvent } from "../nostr/event";
import type {
  RelayConnection,
  RelayFilter,
  RelaySubscriptionHandlers,
  RelayUrl,
} from "../relay/relay-connection";
import { isLocalNetworkRelay } from "../relay/relay-url";
import { MAX_CONNECTIONS } from "./default-relays";
import {
  type ReconnectReason,
  RelaySession,
  type SessionHold,
  type SessionSubscription,
} from "./relay-session";
import { type Scheduler, defaultScheduler } from "./scheduler";

export type PooledSubscription = SessionSubscription;

export type PooledHold = SessionHold;

/**
 * `reserved` はブートストラップ専用の予算の迂回。迂回できないとルーティング表構築自体が
 * 循環する。購読の枠（`once` の順番待ち）は `reserved` でも迂回できない。
 */
export type SubscribeOptions = { reserved?: boolean; once?: boolean };

/** 指数バックオフの下で 4 回はおよそ 15 秒ぶんの試行にあたる。 */
export const DEGRADED_AFTER_FAILURES = 4;

/** degraded な URL は購読者が居ないと再接続も止まるため、この経路が無いと永久に除外される。 */
export const DEGRADED_COOLDOWN_MS = 300_000;

export type ConnectionPoolOptions = {
  connect: (url: RelayUrl) => RelayConnection;
  maxConnections?: number;
  /** テスト用。 */
  scheduler?: Scheduler;
  random?: () => number;
  /** ページ自体が手元で開かれていればブラウザは許可を求めないので、そのときだけ真にする。 */
  allowLocalNetwork?: boolean;
  /**
   * そのリレーが同時に受け付ける購読の数（NIP-11 の `max_subscriptions`）。数は書いて
   * ある上限、`null` は NIP-11 を取って上限が書いていないと分かった（枠なし）、
   * `undefined` はまだ取れていないか取れなかった（`DEFAULT_MAX_SUBSCRIPTIONS`）。
   * 呼ぶたびに引くので、取得済みの値を返す軽いものにする。この関数を渡さないプールは枠を持たない。
   */
  maxSubscriptions?: (url: RelayUrl) => number | null | undefined;
  onQueued?: (url: RelayUrl) => void;
};

export type RelayStatus = "in-use" | "failing" | "idle";

/** どの経路も窓口の確保をここで通さないと、予算を迂回する経路が残る。 */
export class ConnectionPool {
  readonly #options: ConnectionPoolOptions;
  readonly #pool = new Map<RelayUrl, RelaySession>();
  readonly #maxConnections: number;
  readonly #scheduler: Scheduler;
  readonly #random: () => number;
  /** `size` は死んだ接続を数えず、予算超過が後から見えなくなるので、作った瞬間の最大値を記録する。 */
  #peakSize = 0;

  /** 窓口は猶予が切れると消えるが、学んだ枠は繋ぎ直しても忘れないよう窓口の外で持つ。 */
  readonly #learnedLimits = new Map<RelayUrl, number>();

  /** 窓口が消えても失敗の記録は残したいので、プールが持つ。 */
  readonly #failures = new Map<
    RelayUrl,
    { count: number; hard: number; timer: ReturnType<Scheduler["setTimeout"]> }
  >();

  /** `replan()` を呼ぶのは `subscribe()` と `handle.close()` だけなので、無いと degraded が積み上がっても再選択が起きない。 */
  readonly #degradedListeners = new Set<(url: RelayUrl) => void>();

  /** 返信相手のリレーや投稿のヒントなど選定を通らない経路があるので、ソケットを作るここで止める。 */
  readonly #blocked = new Set<RelayUrl>();

  /** 他人の relay list にある localhost はその人の手元を指すので、自分で指定したものだけを許す。 */
  readonly #localAllowed = new Map<RelayUrl, number>();

  constructor(options: ConnectionPoolOptions) {
    this.#options = options;
    this.#maxConnections = options.maxConnections ?? MAX_CONNECTIONS;
    this.#scheduler = options.scheduler ?? defaultScheduler;
    this.#random = options.random ?? Math.random;
  }

  get size(): number {
    let open = 0;
    for (const session of this.#pool.values()) {
      if (session.hasConnection) open += 1;
    }
    return open;
  }

  /** 予算を測るのは `size` ではなくこちら。 */
  get peakSize(): number {
    return this.#peakSize;
  }

  /** `pinned` (選択器内の優先確保) とは別物で、両者の食い違いを観測するための値。 */
  get reservedSize(): number {
    let count = 0;
    for (const session of this.#pool.values()) {
      if (session.hasConnection && session.reserved) count += 1;
    }
    return count;
  }

  get degradedRelays(): readonly RelayUrl[] {
    const urls: RelayUrl[] = [];
    for (const [url, { hard }] of this.#failures) {
      if (hard >= DEGRADED_AFTER_FAILURES) urls.push(url);
    }
    return urls;
  }

  /** `idle` は「壊れている」ではなく「今は使っていない」（猶予中も含む）。 */
  statusOf(url: RelayUrl): RelayStatus {
    if (this.#failures.has(url)) return "failing";
    return this.#pool.get(url)?.inUse ? "in-use" : "idle";
  }

  get blockedRelays(): readonly RelayUrl[] {
    return [...this.#blocked];
  }

  isBlocked(url: RelayUrl): boolean {
    return this.#blocked.has(url) || this.isLocalRefused(url);
  }

  isLocalRefused(url: RelayUrl): boolean {
    return (
      !this.#options.allowLocalNetwork &&
      !this.#localAllowed.has(url) &&
      isLocalNetworkRelay(url)
    );
  }

  allowLocalRelays(urls: readonly RelayUrl[]): () => void {
    const added = [...new Set(urls)];
    for (const url of added) {
      this.#localAllowed.set(url, (this.#localAllowed.get(url) ?? 0) + 1);
    }
    let released = false;
    return () => {
      if (released) return;
      released = true;
      for (const url of added) {
        const count = (this.#localAllowed.get(url) ?? 0) - 1;
        if (count > 0) this.#localAllowed.set(url, count);
        else this.#localAllowed.delete(url);
      }
      this.#closeBlocked();
    };
  }

  setBlockedRelays(urls: readonly RelayUrl[]): void {
    this.#blocked.clear();
    for (const url of urls) this.#blocked.add(url);
    this.#closeBlocked();
  }

  #closeBlocked(): void {
    for (const [url, session] of [...this.#pool]) {
      if (this.isBlocked(url)) session.close("blocked");
    }
  }

  /** `SubscriptionManager.dispose()` の購読解除忘れを、`#degradedListeners` を晒さず確認するため。 */
  get degradedListenerCount(): number {
    return this.#degradedListeners.size;
  }

  onDegradedChanged(listener: (url: RelayUrl) => void): () => void {
    this.#degradedListeners.add(listener);
    return () => {
      this.#degradedListeners.delete(listener);
    };
  }

  /** 出る側も通知しないと、冷却明けのリレーが `replan()` まで除外されたままになる。 */
  #notifyDegradedChanged(url: RelayUrl): void {
    for (const listener of [...this.#degradedListeners]) {
      try {
        listener(url);
      } catch (error) {
        console.error(
          "ConnectionPool: an onDegradedChanged listener threw; isolating it so the remaining listeners keep receiving notifications.",
          error,
        );
      }
    }
  }

  #recordPeak(): void {
    const current = this.size;
    if (current > this.#peakSize) this.#peakSize = current;
  }

  /** 冷却タイマーを張り直さないと、前回の期限で degraded が解除されてしまう。 */
  #noteFailure(url: RelayUrl, reason: ReconnectReason): void {
    const existing = this.#failures.get(url);
    if (existing) this.#scheduler.clearTimeout(existing.timer);
    const count = (existing?.count ?? 0) + 1;
    const previousHard = existing?.hard ?? 0;
    const hard = previousHard + (reason === "relay" ? 1 : 0);
    const timer = this.#scheduler.setTimeout(() => {
      // `#failures.delete` を直に呼ばない —— クールダウン満了は degraded
      // 集合からの離脱そのものなので、通知経路 (`#clearFailures`) を通す。
      this.#clearFailures(url);
    }, DEGRADED_COOLDOWN_MS);
    this.#failures.set(url, { count, hard, timer });

    if (
      previousHard < DEGRADED_AFTER_FAILURES &&
      hard >= DEGRADED_AFTER_FAILURES
    ) {
      this.#notifyDegradedChanged(url);
    }
  }

  /** degraded だったなら通知しないと、復帰したリレーは無関係な `replan()` まで候補に戻らない。 */
  #clearFailures(url: RelayUrl): void {
    const existing = this.#failures.get(url);
    if (!existing) return;
    this.#scheduler.clearTimeout(existing.timer);
    this.#failures.delete(url);
    if (existing.hard >= DEGRADED_AFTER_FAILURES) {
      this.#notifyDegradedChanged(url);
    }
  }

  #createSession(url: RelayUrl): RelaySession {
    const { maxSubscriptions, onQueued, connect } = this.#options;
    const session: RelaySession = new RelaySession({
      url,
      scheduler: this.#scheduler,
      random: this.#random,
      connect: () => connect(url),
      makeRoom: () => this.#makeRoom(),
      failureCount: () => this.#failures.get(url)?.count ?? 0,
      noteFailure: (reason) => this.#noteFailure(url, reason),
      clearFailures: () => this.#clearFailures(url),
      onConnected: () => this.#recordPeak(),
      ...(maxSubscriptions && { declaredLimit: () => maxSubscriptions(url) }),
      learnedLimit: () => this.#learnedLimits.get(url),
      learn: (limit) => {
        const learned =
          this.#learnedLimits.get(url) ?? Number.POSITIVE_INFINITY;
        this.#learnedLimits.set(url, Math.min(learned, limit));
      },
      onQueued: () => onQueued?.(url),
      onClosed: () => {
        if (this.#pool.get(url) === session) this.#pool.delete(url);
      },
    });
    return session;
  }

  #acquire(
    url: RelayUrl,
    options?: SubscribeOptions,
  ): RelaySession | undefined {
    if (this.isBlocked(url)) return undefined;
    let session = this.#pool.get(url);
    const created = !session;
    if (!session) {
      // 接続を開く前に表へ載せる。接続数の最大値 (`#recordPeak`) が、この窓口を数えるため。
      session = this.#createSession(url);
      this.#pool.set(url, session);
    }
    if (!session.ensureConnected(options?.reserved ?? false)) {
      if (created) this.#pool.delete(url);
      return undefined;
    }
    return session;
  }

  subscribe(
    url: RelayUrl,
    filters: RelayFilter[],
    handlers: RelaySubscriptionHandlers,
    options?: SubscribeOptions,
  ): PooledSubscription | undefined {
    return this.#acquire(url, options)?.subscribe(filters, handlers, {
      once: options?.once,
    });
  }

  hold(url: RelayUrl, options?: SubscribeOptions): PooledHold | undefined {
    return this.#acquire(url, options)?.hold();
  }

  publish(url: RelayUrl, event: NostrEvent): Promise<void> {
    if (this.isBlocked(url)) {
      return Promise.reject(new Error(`blocked relay: ${url}`));
    }
    const session = this.#acquire(url);
    if (!session) {
      return Promise.reject(
        new Error(`connection budget exhausted for ${url}`),
      );
    }
    return session.publish(event);
  }

  /** degraded で購読ゼロになった URL の `#failures` は窓口を通らず残るので、ループ後に消す。 */
  retryNow(): void {
    for (const session of [...this.#pool.values()]) session.retryNow();
    // `#failures.clear()` を直に呼ばない —— degraded だった URL は今ここで
    // 集合から出るので、購読者に知らせないと手動再試行が「バックオフだけ
    // 消して選択には反映されない」半端な操作になる。キーはスナップショット
    // を取ってから回す (`#clearFailures` が反復対象の Map を変更する)。
    for (const url of [...this.#failures.keys()]) this.#clearFailures(url);
  }

  resetAuthentication(): void {
    for (const session of [...this.#pool.values()]) {
      session.resetAuthentication();
    }
  }

  /** 放置すると最大 5 分の冷却タイマーが dispose 済みプールを掴み続けるので、ここで消す。 */
  dispose(): void {
    for (const session of [...this.#pool.values()]) session.close();
    this.#pool.clear();
    // dispose() は復帰ではない。ここを `#clearFailures` に寄せると、
    // 自分より長生きした listener にだけ届く通知を作ることになる
    // (`SubscriptionManager.dispose()` は #offDegraded を先に呼んでから
    // pool.dispose() する)。意図的に直接消す。
    for (const { timer } of this.#failures.values()) {
      this.#scheduler.clearTimeout(timer);
    }
    this.#failures.clear();
  }

  /** 使っている接続からは奪わず、猶予中のものだけを古い順に閉じる。 */
  #makeRoom(): boolean {
    if (this.size < this.#maxConnections) return true;
    const lingering: { session: RelaySession; since: number }[] = [];
    for (const session of this.#pool.values()) {
      const since = session.lingeringSince;
      if (since !== null) lingering.push({ session, since });
    }
    lingering.sort((a, b) => a.since - b.since);
    for (const { session } of lingering) {
      session.close();
      if (this.size < this.#maxConnections) return true;
    }
    return false;
  }
}
