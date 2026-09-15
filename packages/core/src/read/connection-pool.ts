import type { NostrEvent } from "../nostr/event";
import type {
  RelayConnection,
  RelayFilter,
  RelaySubscription,
  RelaySubscriptionHandlers,
  RelayUrl,
} from "../relay/relay-connection";
import { MAX_CONNECTIONS } from "./default-relays";

export type PooledSubscription = { close(): void };

/**
 * `hold()` が返すハンドル。`PooledSubscription` と違い `subscription` を
 * 一切持たない — hold は REQ を出さない (`hold()` のコメント参照)。
 */
export type PooledHold = { release(): void };

/**
 * `reserved: true` は予算チェックを丸ごと迂回する唯一の脱出口。ブートストラップ
 * 専用 —— 迂回できないとルーティング表構築自体が循環するため。
 */
export type SubscribeOptions = { reserved?: boolean };

/**
 * 再接続タイマーの注入口。ハンドル型を `typeof setTimeout` の戻り値にして
 * いるのは、DOM lib (`number`) でも Node lib (`NodeJS.Timeout`) でも通すため。
 */
export type Scheduler = {
  setTimeout: (
    callback: () => void,
    delayMs: number,
  ) => ReturnType<typeof setTimeout>;
  clearTimeout: (handle: ReturnType<typeof setTimeout>) => void;
  /**
   * 現在時刻 (ミリ秒エポック)。鮮度判定は分岐に使うので、タイマーと同じく
   * 注入できなければテストが時間を決められない。
   */
  now: () => number;
};

/** 「注入されなければ実タイマー」という規約の既定値。 */
export const defaultScheduler: Scheduler = {
  setTimeout: (callback, delayMs) => setTimeout(callback, delayMs),
  clearTimeout: (handle) => clearTimeout(handle),
  now: () => Date.now(),
};

const RECONNECT_BASE_MS = 1_000;
/** 指数バックオフの上限。ここで頭打ちにしても諦めずに回し続ける。 */
const RECONNECT_MAX_MS = 60_000;

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

/**
 * `count` はどちらの理由でも増えるが、`hard` (degraded 判定) は `"relay"`
 * のときだけ増える。予算超過のバウンスを混ぜると健全なリレーまで degraded 判定される。
 */
type ReconnectReason = "relay" | "budget";

/**
 * NIP-01 は OK 送信を義務づけるが、レート制限時に黙って捨てる relay が
 * 実在し、`publish()` は OK かソケット死亡でしか settle しないため必要。
 */
export const PUBLISH_TIMEOUT_MS = 10_000;

/**
 * `publish()` が予算の参照カウントに相乗りするための一時 `Entry` 用ハンドラ。
 * REQ を送らないので呼ばれず、`#reconnect()` の引き直しの失敗も黙って吸収する。
 */
const PUBLISH_ONLY_HANDLERS: RelaySubscriptionHandlers = {
  onEvent: () => {},
  onEose: () => {},
  onClosed: () => {},
};

export type ConnectionPoolOptions = {
  connect: (url: RelayUrl) => RelayConnection;
  /** アプリ全体で同時に開く接続の上限。既定は MAX_CONNECTIONS */
  maxConnections?: number;
  /** 再接続タイマーの注入口 (テスト用)。既定は実タイマー。 */
  scheduler?: Scheduler;
  /** ジッタの注入口 (テスト用)。既定は Math.random。 */
  random?: () => number;
};

/** 1 本の `subscribe()` 呼び出しに対応する登録。 */
type Entry = {
  filters: RelayFilter[];
  handlers: RelaySubscriptionHandlers;
  subscription: RelaySubscription | null;
};

/**
 * 1 つの URL に対するプールの状態。`connection` が `null` でもエントリは
 * この URL を諦めていないので `#pool` からは消さず、再接続の対象として残す。
 */
type Pooled = {
  connection: RelayConnection | null;
  entries: Set<Entry>;
  /** 接続の死亡通知の購読解除。`connection` が非 null の間だけ非 null。 */
  offClose: (() => void) | null;
  /**
   * ソケットが実際に開いた通知の購読解除 (`offClose` と同じ規約)。`connect()`
   * が返っただけでは証拠にならないので、`#failures` を消すのはこの発火時だけ。
   */
  offOpen: (() => void) | null;
  /**
   * 保留中の再接続タイマー。接続済み、または待つエントリが無い間は必ず
   * `null` — 残ったままだと誰も待っていないリレーへ再接続し続ける。
   */
  timer: ReturnType<Scheduler["setTimeout"]> | null;
  /**
   * この URL が `{ reserved: true }` で少なくとも 1 回要求されたか。`selectRelays`
   * の `pinned` とは別物 —— こちらは予算チェックそのものを迂回する側。
   */
  reserved: boolean;
  /**
   * `hold()` が保持している数。`entries` とは独立したカウンタで、
   * `entries` が 0 になっても `holds` が残っていれば接続は落とさない。
   */
  holds: number;
};

/**
 * すべてのリレー接続を所有し、接続予算を実際に強制する唯一の場所。どの
 * 経路であっても、ここを通ることで初めて予算が効く。
 */
export class ConnectionPool {
  readonly #options: ConnectionPoolOptions;
  readonly #pool = new Map<RelayUrl, Pooled>();
  readonly #maxConnections: number;
  readonly #scheduler: Scheduler;
  readonly #random: () => number;
  /**
   * `size` は生きている接続しか数えず、予算超過の接続が死んだ後に読むと
   * 予算内に見えてしまうので、ソケットを作った瞬間の値を単調増加で記録する。
   */
  #peakSize = 0;

  /**
   * URL → 失敗の記録と冷却タイマー。プールが持つのは `#drop` でエントリが
   * 消えても失われないため (`count`/`hard` の意味は `ReconnectReason` 参照)。
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

  constructor(options: ConnectionPoolOptions) {
    this.#options = options;
    this.#maxConnections = options.maxConnections ?? MAX_CONNECTIONS;
    this.#scheduler = options.scheduler ?? defaultScheduler;
    this.#random = options.random ?? Math.random;
  }

  get size(): number {
    let open = 0;
    for (const pooled of this.#pool.values()) {
      if (pooled.connection) open += 1;
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
    for (const pooled of this.#pool.values()) {
      if (pooled.connection && pooled.reserved) count += 1;
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

  /**
   * `subscribe()` と `publish()` の両方が使う接続確保の共通部分。予算チェック
   * とソケット生成を一本化しないと、片方だけ直されて迂回する経路が残る。
   */
  #ensureConnection(
    url: RelayUrl,
    options?: SubscribeOptions,
  ): Pooled | undefined {
    let pooled = this.#pool.get(url);
    // `pooled` が無い場合だけでなく、エントリは残っているが接続が
    // 自然死している場合も新しいソケットが要る = 予算を消費する。
    if (!pooled || !pooled.connection) {
      if (!options?.reserved && this.size >= this.#maxConnections) {
        return undefined;
      }

      if (!pooled) {
        pooled = {
          connection: null,
          entries: new Set(),
          offClose: null,
          offOpen: null,
          timer: null,
          reserved: false,
          holds: 0,
        };
        this.#pool.set(url, pooled);
      }

      try {
        const connection = this.#options.connect(url);
        // `subscribe()`/`#reconnect()` のどちらが呼んでも「接続が繋がった
        // 直後」の後始末を同じにする — 詳細は `#attachConnection` 参照。
        this.#attachConnection(url, pooled, connection);
      } catch {
        // connection は null のまま。#pool からは消さない (再接続対象として
        // 残す)。`#noteFailure` はここでは呼ばない —— `subscribe()` が直後に
        // 必ず `#scheduleReconnect` を呼ぶので、二重計上になる。
      }
    }

    // 一度でも `{ reserved: true }` で要求されたら、この `Pooled` が生きて
    // いる間は reserved として数える。`reserved` は `Pooled` のフィールドで、
    // `#drop` でレコードごと消えれば次に作られる `Pooled` は `reserved: false`
    // に戻る —— 同じ URL でも drop を挟めば `reservedSize` の対象から外れる。
    if (options?.reserved) pooled.reserved = true;

    return pooled;
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
    const pooled = this.#ensureConnection(url, options);
    if (!pooled) return undefined;

    const entry: Entry = { filters, handlers, subscription: null };
    pooled.entries.add(entry);

    if (pooled.connection) {
      try {
        entry.subscription = pooled.connection.subscribe(filters, handlers);
      } catch {
        entry.subscription = null;
      }
    } else {
      // connect() が失敗した場合。呼ばないと、一度も繋がったことのない
      // relay は #onConnectionDied を経由しないので再試行が一切積まれない。
      this.#scheduleReconnect(url);
    }

    if (!entry.subscription) {
      handlers.onClosed("relay unavailable");
    }

    return {
      close: () => {
        const current = this.#pool.get(url);
        // dispose() 済み、二重 close、あるいは dispose を挟んで同じ URL が
        // 開き直された場合 — いずれもこの entry は今の集合に居ないので
        // 何もしない。
        if (!current || !current.entries.has(entry)) return;
        current.entries.delete(entry);
        entry.subscription?.close();
        // hold() だけが残っていれば接続は落とさない — ブートストラップが
        // フェーズ間で握り続けている接続を、フェーズ①の購読が閉じただけで
        // 落としてはいけない。
        if (current.entries.size === 0 && current.holds === 0) {
          this.#drop(url);
        }
      },
    };
  }

  /**
   * REQ を出さずに接続だけを確保する。**購読ではない。** 一部のリレーは
   * 絶対にマッチしないフィルタの REQ を `blocked` で CLOSE するため必要。
   */
  hold(url: RelayUrl, options?: SubscribeOptions): PooledHold | undefined {
    const pooled = this.#ensureConnection(url, options);
    if (!pooled) return undefined;

    pooled.holds += 1;

    if (!pooled.connection) {
      // subscribe() の対応する分岐と同じ理由: この hold のために
      // #ensureConnection が試みた connect() が失敗した場合、ここで
      // #scheduleReconnect を呼ばないと、この URL に subscribe() 由来の
      // エントリが 1 つも無い限り再接続が一度もスケジュールされない。
      this.#scheduleReconnect(url);
    }

    let released = false;
    return {
      release: () => {
        // 冪等 — 二重に呼ばれても holds を負にしない。二重 release() は
        // 呼び出し元のバグでも起こりうる (bootstrap.ts の finally など)。
        if (released) return;
        released = true;
        const current = this.#pool.get(url);
        // `close()` の対応する分岐と同じ理由 — dispose() を挟んで同じ URL が
        // 開き直された場合、今ここに居るのは別のレコードである。同一性を
        // 確かめずに減らすと、この release() が後から作られた無関係な
        // hold の枠を奪い、まだ握っている呼び出し元の接続を落としてしまう。
        if (!current || current !== pooled) return;
        current.holds -= 1;
        if (current.holds === 0 && current.entries.size === 0) {
          this.#drop(url);
        }
      },
    };
  }

  /**
   * publish 経路。タイムアウトは reject と同時に必ず `release()` も行う ——
   * 予算を返さない決着の仕方を作らない。
   */
  publish(url: RelayUrl, event: NostrEvent): Promise<void> {
    const pooled = this.#ensureConnection(url);
    if (!pooled) {
      return Promise.reject(
        new Error(`connection budget exhausted for ${url}`),
      );
    }
    if (!pooled.connection) {
      // connect() が失敗を吸収した後。publish は entry を足さないので、
      // 誰も待っていなければここでレコードを片付ける (hold() が生きていれば
      // 自身のタイマーが `#reconnect` を見つけられなくなるので消さない)。
      if (pooled.entries.size === 0 && pooled.holds === 0) {
        this.#drop(url);
      }
      return Promise.reject(new Error(`relay unavailable: ${url}`));
    }
    const connection = pooled.connection;

    const entry: Entry = {
      filters: [],
      handlers: PUBLISH_ONLY_HANDLERS,
      subscription: null,
    };
    pooled.entries.add(entry);

    const release = (): void => {
      const current = this.#pool.get(url);
      if (!current || !current.entries.has(entry)) return;
      current.entries.delete(entry);
      // hold() だけが残っていれば接続は落とさない (subscribe() の close()
      // と同じ理由)。
      if (current.entries.size === 0 && current.holds === 0) {
        this.#drop(url);
      }
    };

    return new Promise<void>((resolve, reject) => {
      // OK も死亡通知も来ないまま両方が発火することがある
      // (タイムアウト後にソケットが死ぬ、等) —— 二重に settle させない。
      let settled = false;

      const timer = this.#scheduler.setTimeout(() => {
        if (settled) return;
        settled = true;
        release();
        reject(
          new Error(
            `publish timed out for ${url} after ${PUBLISH_TIMEOUT_MS}ms`,
          ),
        );
      }, PUBLISH_TIMEOUT_MS);

      connection.publish(event).then(
        () => {
          if (settled) return;
          settled = true;
          this.#scheduler.clearTimeout(timer);
          release();
          resolve();
        },
        (error: unknown) => {
          if (settled) return;
          settled = true;
          this.#scheduler.clearTimeout(timer);
          release();
          reject(error);
        },
      );
    });
  }

  /**
   * 手動再試行。バックオフを破棄し即座に `#reconnect()` を試みる。degraded で
   * 購読ゼロになった URL の `#failures` は生き残るので、ループ後に丸ごと消す。
   */
  retryNow(): void {
    for (const [url, pooled] of this.#pool) {
      if (pooled.connection) continue;
      if (pooled.timer !== null) {
        this.#scheduler.clearTimeout(pooled.timer);
        pooled.timer = null;
      }
      this.#clearFailures(url);
      this.#reconnect(url);
    }
    // `#failures.clear()` を直に呼ばない —— degraded だった URL は今ここで
    // 集合から出るので、購読者に知らせないと手動再試行が「バックオフだけ
    // 消して選択には反映されない」半端な操作になる。キーはスナップショット
    // を取ってから回す (`#clearFailures` が反復対象の Map を変更する)。
    for (const url of [...this.#failures.keys()]) this.#clearFailures(url);
  }

  /**
   * `#drop` は `#failures` に触らないが、dispose() 後に放置すると最大 5 分の
   * `setTimeout` が dispose 済みプールを掴み続けるので、ここで明示的に消す。
   */
  dispose(): void {
    for (const url of [...this.#pool.keys()]) this.#drop(url);
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

  #drop(url: RelayUrl): void {
    const pooled = this.#pool.get(url);
    if (!pooled) return;
    // タイマーが残ったまま消すと、閉じたはずのリレーへ永遠に再接続し続ける
    // ゾンビタイマーになる。
    if (pooled.timer !== null) this.#scheduler.clearTimeout(pooled.timer);
    pooled.offClose?.();
    pooled.offOpen?.();
    pooled.connection?.close();
    this.#pool.delete(url);
  }

  /**
   * ソケットが自らの意思とは無関係に死んだときの通知先。`onClosed` はここでは
   * 呼ばない —— 接続側が既に配り終えているので、二重に呼ぶと二重計上される。
   */
  #onConnectionDied(url: RelayUrl): void {
    const pooled = this.#pool.get(url);
    if (!pooled) return;
    pooled.offClose?.();
    pooled.offClose = null;
    pooled.offOpen?.();
    pooled.offOpen = null;
    pooled.connection = null;
    for (const entry of pooled.entries) entry.subscription = null;
    this.#scheduleReconnect(url);
  }

  /**
   * 指数バックオフ + ジッタで再接続タイマーを積む。ジッタが無いと、同時に
   * 死んだ複数リレーの再接続が同期し復帰の瞬間にバーストを作ってしまう。
   */
  #scheduleReconnect(url: RelayUrl, reason: ReconnectReason = "relay"): void {
    const pooled = this.#pool.get(url);
    if (!pooled || pooled.connection || pooled.timer !== null) return;
    // hold だけの URL も再接続の対象 — 「誰も待っていない」の「誰か」には
    // hold も含める。
    if (pooled.entries.size === 0 && pooled.holds === 0) return;

    // 指数は「今までの」失敗回数から計算し、その後で今回の失敗を記録する
    // (`#noteFailure` を呼ぶ) — 順序を逆にすると 1 回目の遅延から既に
    // 2 倍されてしまう。
    const count = this.#failures.get(url)?.count ?? 0;
    const base = Math.min(RECONNECT_BASE_MS * 2 ** count, RECONNECT_MAX_MS);
    const delay = base * (0.5 + this.#random());
    this.#noteFailure(url, reason);
    pooled.timer = this.#scheduler.setTimeout(() => {
      pooled.timer = null;
      this.#reconnect(url);
    }, delay);
  }

  /**
   * `#ensureConnection` と `#reconnect()` の両方がここを通る —— 怠ると
   * 蘇らせても REQ が張り直されず、ソケットは生きたままカラムが沈黙する。
   */
  #attachConnection(
    url: RelayUrl,
    pooled: Pooled,
    connection: RelayConnection,
  ): void {
    if (pooled.timer !== null) {
      this.#scheduler.clearTimeout(pooled.timer);
      pooled.timer = null;
    }
    // 古い offOpen が残っていれば (通常は #onConnectionDied 経由で既に
    // null になっているはずだが、offClose と同じ扱いで念のため) 先に
    // 解除してから張り直す。
    pooled.offOpen?.();
    pooled.connection = connection;
    pooled.offClose = connection.onClose(() => this.#onConnectionDied(url));
    pooled.offOpen = connection.onOpen(() => this.#clearFailures(url));
    this.#recordPeak();

    for (const entry of pooled.entries) {
      try {
        entry.subscription = connection.subscribe(
          entry.filters,
          entry.handlers,
        );
      } catch {
        entry.subscription = null;
        // 複数エントリを 1 つのループで処理しているので、無防備に呼ぶと
        // 1 つが投げただけで残りが REQ 無しのまま取り残される。隔離が主目的。
        try {
          entry.handlers.onClosed("relay unavailable");
        } catch (error) {
          console.error(
            "ConnectionPool: an onClosed handler threw while re-attaching; isolating it so the remaining entries keep their subscriptions.",
            error,
          );
        }
      }
    }
  }

  /**
   * 実際の再接続の試行。失敗は外へ投げず吸収してバックオフを積み直す。
   * `since` で埋めず元のフィルタを張り直すのは、500 件上限を食いつぶさないため。
   */
  #reconnect(url: RelayUrl): void {
    const pooled = this.#pool.get(url);
    // hold だけの URL も再接続の対象 (#scheduleReconnect のガードと同じ
    // 理由)。
    if (
      !pooled ||
      pooled.connection ||
      (pooled.entries.size === 0 && pooled.holds === 0)
    ) {
      return;
    }

    // 枠が無ければ諦めず後で再試行する (生きている接続から奪わない)。
    // `{ reserved: true }` はここでは特別扱いしない —— 予約は最初の
    // `subscribe()` 呼び出し限りで、待てなければ `collect()` のタイムアウトが縮退させる。
    if (this.size >= this.#maxConnections) {
      // 予算超過はこのリレー自身の健全性とは無関係 (`ReconnectReason` 参照)。
      this.#scheduleReconnect(url, "budget");
      return;
    }

    let connection: RelayConnection;
    try {
      connection = this.#options.connect(url);
    } catch {
      // `#noteFailure` はここでは呼ばない — 直後の `#scheduleReconnect` が
      // 必ず呼ぶので、ここでも呼ぶと同じ 1 回の失敗を二重に計上してしまう
      // (`#ensureConnection` の catch 節と同じ理由)。
      this.#scheduleReconnect(url);
      return;
    }

    this.#attachConnection(url, pooled, connection);
  }
}
