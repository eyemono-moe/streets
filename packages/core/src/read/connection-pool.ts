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
  type Scheduler,
  type SessionHold,
  type SessionSubscription,
  defaultScheduler,
} from "./relay-session";

export { type Scheduler, defaultScheduler };

export type PooledSubscription = SessionSubscription;

/**
 * `hold()` が返すハンドル。`PooledSubscription` と違い `subscription` を
 * 一切持たない — hold は REQ を出さない (`hold()` のコメント参照)。
 */
export type PooledHold = SessionHold;

/**
 * `reserved: true` は接続数の予算チェックを丸ごと迂回する唯一の脱出口。ブートストラップ
 * 専用 —— 迂回できないとルーティング表構築自体が循環するため。
 *
 * `once: true` は EOSE で終わる一度きりの取得。リレーごとの同時購読の枠が埋まって
 * いるとき、流し続ける購読より後ろに並び、EOSE を受けると窓口が REQ を閉じて枠を返す。
 * `reserved`（接続数の迂回）とは無関係で、購読の枠は `reserved` でも迂回できない。
 */
export type SubscribeOptions = { reserved?: boolean; once?: boolean };

/**
 * この回数だけ連続で開けなかった URL を degraded とみなす。指数バックオフ
 * の下で 4 回はおよそ 15 秒ぶんの試行にあたる。
 */
export const DEGRADED_AFTER_FAILURES = 4;

/**
 * 最後の失敗からこれだけ経てば失敗履歴を捨て、候補に戻す。degraded な URL
 * は購読者が居ないと再接続も止まるため、この経路が無いと永久に除外される。
 */
export const DEGRADED_COOLDOWN_MS = 300_000;

export type ConnectionPoolOptions = {
  connect: (url: RelayUrl) => RelayConnection;
  /** アプリ全体で同時に開く接続の上限。既定は MAX_CONNECTIONS */
  maxConnections?: number;
  /** 再接続タイマーの注入口 (テスト用)。既定は実タイマー。 */
  scheduler?: Scheduler;
  /** ジッタの注入口 (テスト用)。既定は Math.random。 */
  random?: () => number;
  /**
   * ローカルネットワークのリレーへ、`allowLocalRelays()` で許したもの以外も繋ぐか。
   * ページ自体が手元で開かれていればブラウザは許可を求めないので、そのときだけ真にする。
   */
  allowLocalNetwork?: boolean;
  /**
   * そのリレーが同時に受け付ける購読の数（NIP-11 の `max_subscriptions`）。数は書いて
   * ある上限、`null` は NIP-11 を取って上限が書いていないと分かった（枠なし）、
   * `undefined` はまだ取れていないか取れなかった（`DEFAULT_MAX_SUBSCRIPTIONS`）。
   * 呼ぶたびに引くので、取得済みの値を返す軽いものにする。この関数を渡さないプールは枠を持たない。
   */
  maxSubscriptions?: (url: RelayUrl) => number | null | undefined;
  /** 同時購読の枠が埋まっていて、REQ を送らず待たせた。Devtools で数えるため。 */
  onQueued?: (url: RelayUrl) => void;
};

export type RelayStatus = "in-use" | "failing" | "idle";

/**
 * リレーごとの窓口（`RelaySession`）の表と、接続数の予算を強制する唯一の場所。どの
 * 経路であっても、ここを通ることで初めて予算が効く。
 */
export class ConnectionPool {
  readonly #options: ConnectionPoolOptions;
  readonly #pool = new Map<RelayUrl, RelaySession>();
  readonly #maxConnections: number;
  readonly #scheduler: Scheduler;
  readonly #random: () => number;
  /**
   * `size` は生きている接続しか数えず、予算超過の接続が死んだ後に読むと
   * 予算内に見えてしまうので、ソケットを作った瞬間の値を単調増加で記録する。
   */
  #peakSize = 0;

  /**
   * NOTICE / CLOSED で上限に断られて学んだ、リレーごとの同時購読の数。NIP-11 の値
   * より厳しいときだけ効く。窓口は猶予が切れると消えるので、繋ぎ直しても忘れないよう
   * 窓口の外で持つ。
   */
  readonly #learnedLimits = new Map<RelayUrl, number>();

  /**
   * URL → 失敗の記録と冷却タイマー。窓口が消えても失われないよう、プールが持つ
   * (`count`/`hard` の意味は `ReconnectReason` 参照)。
   */
  readonly #failures = new Map<
    RelayUrl,
    { count: number; hard: number; timer: ReturnType<Scheduler["setTimeout"]> }
  >();

  /**
   * `replan()` を呼ぶのは `subscribe()` と `handle.close()` だけなので、
   * これが無いと接続が死んで degraded が積み上がっても再選択が起きない。
   */
  readonly #degradedListeners = new Set<(url: RelayUrl) => void>();

  /**
   * ユーザーが繋がないと決めたリレー（kind:10006）。返信相手のリレーや投稿に
   * 付いたヒントなど、選定を通らない経路もあるので、ソケットを作るここで止める。
   */
  readonly #blocked = new Set<RelayUrl>();

  /**
   * 繋いでよいローカルネットワークのリレーと、許している呼び出し元の数。他人の
   * relay list にある localhost はその人の手元を指すので、自分で指定したものだけを許す。
   */
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

  /** `size` の観測史上の最大値。予算を測るのはこちら。 */
  get peakSize(): number {
    return this.#peakSize;
  }

  /**
   * `{ reserved: true }` 経由で要求された URL のうち生きている接続の本数。
   * `pinned` (選択器内の優先確保) とは別物で、両者の食い違いを観測できる。
   */
  get reservedSize(): number {
    let count = 0;
    for (const session of this.#pool.values()) {
      if (session.hasConnection && session.reserved) count += 1;
    }
    return count;
  }

  /**
   * リレー起因の連続失敗が `DEGRADED_AFTER_FAILURES` 以上の URL。予算超過の
   * バウンスは `hard` には入らないので影響しない。
   */
  get degradedRelays(): readonly RelayUrl[] {
    const urls: RelayUrl[] = [];
    for (const [url, { hard }] of this.#failures) {
      if (hard >= DEGRADED_AFTER_FAILURES) urls.push(url);
    }
    return urls;
  }

  /**
   * 設定の画面に出す、その URL の今の様子。接続は必要になったときだけ開くので、
   * `idle` は「壊れている」ではなく「今は使っていない」（猶予中の接続も含む）。`failing` は開けずに
   * 失敗が残っている間（開けたか冷却が明けると消える）。
   */
  statusOf(url: RelayUrl): RelayStatus {
    if (this.#failures.has(url)) return "failing";
    return this.#pool.get(url)?.inUse ? "in-use" : "idle";
  }

  get blockedRelays(): readonly RelayUrl[] {
    return [...this.#blocked];
  }

  /** 繋がないリレーか。ユーザーが止めたものと、許していないローカルネットワークのもの。 */
  isBlocked(url: RelayUrl): boolean {
    return this.#blocked.has(url) || this.isLocalRefused(url);
  }

  /** 自分で指定していないローカルネットワークのリレーか。 */
  isLocalRefused(url: RelayUrl): boolean {
    return (
      !this.#options.allowLocalNetwork &&
      !this.#localAllowed.has(url) &&
      isLocalNetworkRelay(url)
    );
  }

  /**
   * 自分で指定したリレーを、ローカルネットワークのものでも繋げるようにする。
   * 返した関数で取り下げ、どこからも許されていなければその場で閉じる。
   */
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

  /**
   * 繋がないリレーを差し替える。新しく入った URL の接続はその場で閉じ、
   * 待っていた購読には `onClosed` を配る —— 配らないと一度きりの取得が
   * タイムアウトまで待ち続ける。外れた URL は次に要求されたときに開く。
   */
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

  /**
   * `onDegradedChanged()` の登録数。`SubscriptionManager.dispose()` が
   * 購読解除を忘れていないかを、`#degradedListeners` を晒さず確認する手段。
   */
  get degradedListenerCount(): number {
    return this.#degradedListeners.size;
  }

  /**
   * `degradedRelays` の membership が変わる瞬間だけ、入/出それぞれ 1 回
   * 発火する。頻度の保証ではなく、単発の失敗では発火しないことだけを保証する。
   */
  onDegradedChanged(listener: (url: RelayUrl) => void): () => void {
    this.#degradedListeners.add(listener);
    return () => {
      this.#degradedListeners.delete(listener);
    };
  }

  /**
   * `#noteFailure`/`#clearFailures` の両方から呼ぶ —— 出る側が無いと、
   * 冷却明けのリレーが `replan()` まで除外されたままになる。
   */
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

  /** ソケットを実際に作った直後に呼ぶ。size の一時的なピークを取り逃さない。 */
  #recordPeak(): void {
    const current = this.size;
    if (current > this.#peakSize) this.#peakSize = current;
  }

  /**
   * `url` の失敗を 1 記録し、冷却タイマーを張り直す —— 前回の期限で
   * degraded が解除されないようにするため。
   */
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

  /**
   * `url` の失敗履歴を消す。消す前に degraded だったなら通知する —— しないと、
   * 復帰したリレーは無関係な `replan()` が走るまで候補に戻らない。
   */
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

  /**
   * `subscribe()`・`hold()`・`publish()` が使う窓口の確保。予算が足りなければ
   * `undefined`（足りない URL の窓口は表に残さない）。
   */
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

  /**
   * 購読 (REQ) の経路。接続や購読の確立に失敗しても例外は外に投げず、
   * `handlers.onClosed(...)` に変換して伝える (呼び出し元を壊さないため)。
   */
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

  /**
   * REQ を出さずに接続だけを確保する。**購読ではない。** 一部のリレーは
   * 絶対にマッチしないフィルタの REQ を `blocked` で CLOSE するため必要。
   */
  hold(url: RelayUrl, options?: SubscribeOptions): PooledHold | undefined {
    return this.#acquire(url, options)?.hold();
  }

  /** publish 経路。窓口の側で、タイムアウトしても接続を返す。 */
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

  /**
   * 手動再試行。バックオフを破棄し即座に再接続を試みる。degraded で
   * 購読ゼロになった URL の `#failures` は生き残るので、ループ後に丸ごと消す。
   */
  retryNow(): void {
    for (const session of [...this.#pool.values()]) session.retryNow();
    // `#failures.clear()` を直に呼ばない —— degraded だった URL は今ここで
    // 集合から出るので、購読者に知らせないと手動再試行が「バックオフだけ
    // 消して選択には反映されない」半端な操作になる。キーはスナップショット
    // を取ってから回す (`#clearFailures` が反復対象の Map を変更する)。
    for (const url of [...this.#failures.keys()]) this.#clearFailures(url);
  }

  /** 認証を試みた接続を、どの窓口でも張り直す (`RelaySession.resetAuthentication`)。 */
  resetAuthentication(): void {
    for (const session of [...this.#pool.values()]) {
      session.resetAuthentication();
    }
  }

  /**
   * 窓口を閉じても `#failures` は残るが、dispose() 後に放置すると最大 5 分の
   * `setTimeout` が dispose 済みプールを掴み続けるので、ここで明示的に消す。
   */
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

  /**
   * 新しい接続を 1 本開ける枠を作る。猶予中の接続だけを、空になったのが古い順に
   * 閉じる（使っている接続からは奪わない）。作れなければ false。
   */
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
