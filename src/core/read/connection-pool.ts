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
 * `subscribe()` へ渡す省略可能なオプション。
 *
 * `reserved: true` は ADR-0011 の予算チェック (`size >= maxConnections`) を
 * 丸ごと迂回する唯一の脱出口 — **ブートストラップ (`warmUpRouting`,
 * `src/core/read/bootstrap.ts`) 専用であり、それ以外では絶対に使わないこと。**
 * ウォームアップは Outbox ルーティング表そのものを作る処理なので、Outbox の
 * 選択が埋めた予算に阻まれて自分が走れないと、ルーティングが永遠に成立しない
 * (循環する)。これがこの迂回路が存在する唯一の理由であり、ここを起点に別の
 * 呼び出し元が「予算が埋まっていても構わず開きたい」という理由で真似し始めた
 * 瞬間、ADR-0011 の 30 接続という上限は数字の意味を失う。新しい呼び出し元を
 * 追加する前に、まず ADR-0011 を読み直すこと。
 */
export type SubscribeOptions = { reserved?: boolean };

/**
 * 再接続のタイマーを注入するための最小の口 (ADR-0021)。読み取り層は DOM も
 * Node のグローバルも直接掴まない、という構造上の主張をテストで示すために
 * `setTimeout`/`clearTimeout` を外から渡せるようにする。既定値
 * (`defaultScheduler`) はグローバルの `setTimeout`/`clearTimeout` を
 * そのまま使う — 本番ではそれで正しい。ハンドルの型を `typeof setTimeout`
 * の戻り値に合わせているのは、DOM lib と Node lib のどちらがアンビエントに
 * 効いていても (`number` でも `NodeJS.Timeout` でも) そのまま通るように
 * するため。
 */
export type Scheduler = {
  setTimeout: (
    callback: () => void,
    delayMs: number,
  ) => ReturnType<typeof setTimeout>;
  clearTimeout: (handle: ReturnType<typeof setTimeout>) => void;
};

/**
 * `SubscriptionManager` の再プランのデバウンスタイマー (Task 10) もこの既定値を
 * 共有する — 読み取り層のどこであれ「注入されなければ実タイマー」という規約を
 * 一箇所にしておくため、export してある。
 */
export const defaultScheduler: Scheduler = {
  setTimeout: (callback, delayMs) => setTimeout(callback, delayMs),
  clearTimeout: (handle) => clearTimeout(handle),
};

/** 指数バックオフの初回間隔 (ADR-0021)。 */
const RECONNECT_BASE_MS = 1_000;
/** 指数バックオフの上限。ここで頭打ちにして、諦めずに回し続ける (ADR-0021)。 */
const RECONNECT_MAX_MS = 60_000;

export type ConnectionPoolOptions = {
  connect: (url: RelayUrl) => RelayConnection;
  /** アプリ全体で同時に開く接続の上限 (ADR-0011)。既定は MAX_CONNECTIONS */
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
 * 1 つの URL に対するプールの状態。`connection` が `null` なのは
 * 接続を試みて失敗した場合、またはソケットが自然死した場合 —
 * どちらもエントリはこの URL を諦めていないので `#pool` からは
 * 消さない (Task 9 の再接続対象として残す、まさにこのレジストリが
 * 再接続で元のフィルタを張り直す元ネタになる)。
 */
type Pooled = {
  connection: RelayConnection | null;
  entries: Set<Entry>;
  /** 接続の死亡通知の購読解除。`connection` が非 null の間だけ非 null。 */
  offClose: (() => void) | null;
  /**
   * 連続再接続の試行回数。バックオフの指数を決める。再接続に成功する
   * (あるいは `retryNow()` で強制される) たびに 0 に戻る — 失敗の連続だけ
   * を数える。
   */
  attempts: number;
  /**
   * 保留中の再接続タイマー。`connection` が非 null の間、あるいは待っている
   * エントリが無くなった間は必ず `null` — タイマーが残ったままだと、
   * 誰も待っていない (あるいは既に繋がっている) リレーへ永遠に再接続を
   * 試み続けることになる。
   */
  timer: ReturnType<Scheduler["setTimeout"]> | null;
  /**
   * この URL が `{ reserved: true }` 経由 (ブートストラップの予算迂回、
   * `SubscribeOptions` 参照) で少なくとも 1 回要求されたか (final review,
   * finding 9a)。`selectRelays` の `pinned` とは別物 — こちらは
   * `ConnectionPool` の予算チェックそのものを迂回する側であり、
   * `reservedSize` はその迂回が「今」何本の生きている接続を占めているかを
   * 露出するためだけに存在する。
   */
  reserved: boolean;
};

/**
 * すべてのリレー接続を所有し、予算 (ADR-0011) を実際に強制する唯一の場所。
 * URL ごとの購読レジストリでもある — 生きている登録が Task 9 の再接続で
 * 元のフィルタを張り直す元ネタになる。
 *
 * `subscribe()` を通らない経路で接続を開いてはならない。ルーティング済み・
 * 明示指定・fallback のどの経路であっても、ここを通ることで初めて予算が
 * 効く (旧 SubscriptionManager の #acquire は無条件に connect() していた)。
 */
export class ConnectionPool {
  readonly #options: ConnectionPoolOptions;
  readonly #pool = new Map<RelayUrl, Pooled>();
  readonly #maxConnections: number;
  readonly #scheduler: Scheduler;
  readonly #random: () => number;
  /**
   * `size` の過去最大値 (ADR-0011 の高水位マーク)。
   *
   * `size` は「今」生きている接続だけを数えるので、budget を守れていない
   * 実装でも、超過した接続が死んで枠を返した*後*に読めば予算内に見えて
   * しまう — 特にローカルの到達不能リレーは ECONNREFUSED がミリ秒単位で
   * 返るため、settled になった時点ではもう手遅れ (Task 12 fix round 1)。
   * ソケットを実際に作った瞬間に size を測って最大値を更新することで、
   * 一度でも予算を超えて開いた事実を後から消せないようにする。単調増加
   * のみで、接続が死んでも下がらない。
   */
  #peakSize = 0;

  constructor(options: ConnectionPoolOptions) {
    this.#options = options;
    this.#maxConnections = options.maxConnections ?? MAX_CONNECTIONS;
    this.#scheduler = options.scheduler ?? defaultScheduler;
    this.#random = options.random ?? Math.random;
  }

  /** 生きている接続の本数だけを数える (ADR-0021: 死んだ接続は予算を占有しない)。 */
  get size(): number {
    let open = 0;
    for (const pooled of this.#pool.values()) {
      if (pooled.connection) open += 1;
    }
    return open;
  }

  /** `size` の観測史上の最大値。予算を測るのはこちら (Task 12 fix round 1)。 */
  get peakSize(): number {
    return this.#peakSize;
  }

  /**
   * `{ reserved: true }` (ブートストラップの予算迂回) 経由で少なくとも
   * 1 回要求された URL のうち、今生きている接続の本数 (final review,
   * finding 9a)。ADR-0025 の `pinned` (選択器の中で予算を優先確保する仕組み)
   * とこの `reserved` (選択器を経由せず予算チェック自体を飛ばす仕組み) は
   * 別物であり、「30 接続」という 1 つの数字について両者が別々に主張して
   * いる — このアクセサはその食い違いを外から観測できるようにするための
   * ものであり、予算そのものを再構成するものではない
   * (docs/design/read-layer-followups.md 参照)。
   */
  get reservedSize(): number {
    let count = 0;
    for (const pooled of this.#pool.values()) {
      if (pooled.connection && pooled.reserved) count += 1;
    }
    return count;
  }

  /** ソケットを実際に作った直後に呼ぶ。size の一時的なピークを取り逃さない。 */
  #recordPeak(): void {
    const current = this.size;
    if (current > this.#peakSize) this.#peakSize = current;
  }

  /**
   * 予算に空きが無ければ `undefined` を返す — これは「新しい URL を開こうと
   * したが枠が無かった」場合だけに限られる。既に開いている (または開こうと
   * 試みて失敗し記録だけ残っている) URL への追加の購読は、新しいソケットを
   * 要求しないので予算に関係なく常に受け付ける。
   *
   * `options.reserved` が `true` のときは、新しいソケットが要る場合でも
   * この予算チェックそのものを飛ばす。`SubscribeOptions` の定義を参照 —
   * ブートストラップ以外での使用は禁止。
   *
   * 接続や購読の確立に失敗しても例外は外に投げない — `handlers.onClosed(...)`
   * に変換して同期的に伝える。これにより、30 本のうち 1 本が死んでいるだけで
   * 呼び出し元 (SectionReader) が例外で壊れることがなくなる。
   */
  subscribe(
    url: RelayUrl,
    filters: RelayFilter[],
    handlers: RelaySubscriptionHandlers,
    options?: SubscribeOptions,
  ): PooledSubscription | undefined {
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
          attempts: 0,
          timer: null,
          reserved: false,
        };
        this.#pool.set(url, pooled);
      }

      try {
        const connection = this.#options.connect(url);
        pooled.connection = connection;
        pooled.offClose = connection.onClose(() => this.#onConnectionDied(url));
        this.#recordPeak();
      } catch {
        // connection は null のまま。#pool からは消さない (Task 9 が
        // 後で再接続を試みる対象として残す)。
      }
    }

    // 一度でも `{ reserved: true }` で要求されたら、このプロセス内では
    // ずっと reserved として数える (final review, finding 9a) — 同じ URL
    // への以後の通常経路の `subscribe()` 呼び出しが `reservedSize` から
    // 静かに外れてしまわないようにするため。
    if (options?.reserved) pooled.reserved = true;

    const entry: Entry = { filters, handlers, subscription: null };
    pooled.entries.add(entry);

    if (pooled.connection) {
      try {
        entry.subscription = pooled.connection.subscribe(filters, handlers);
      } catch {
        entry.subscription = null;
      }
    } else {
      // The connect() attempt above (fresh or retried) still failed. Without
      // this, a relay whose *first* connect() ever fails would never be
      // scheduled for retry at all -- only deaths after a successful connect
      // go through #onConnectionDied. ADR-0021 says "never give up"; this
      // entry is retained (just added above) so #scheduleReconnect's
      // "nobody is waiting" guard does not bail.
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
        if (current.entries.size === 0) this.#drop(url);
      },
    };
  }

  /**
   * 手動再試行 (ADR-0021)。UI は後続タスクで online/visibilitychange に
   * このメソッドを配線する — その配線自体はアプリ側の責務で、読み取り層は
   * DOM イベントを直接掴まない。
   *
   * 待っている全 URL について、保留中のバックオフタイマーを破棄し、
   * 連続失敗回数をリセットしてから即座に `#reconnect()` を試みる。既に
   * 繋がっている URL (`connection` が非 null) はそもそも対象外 —
   * 触ると生きているソケットを無駄に張り直すことになる。
   */
  retryNow(): void {
    for (const [url, pooled] of this.#pool) {
      if (pooled.connection) continue;
      if (pooled.timer !== null) {
        this.#scheduler.clearTimeout(pooled.timer);
        pooled.timer = null;
      }
      pooled.attempts = 0;
      this.#reconnect(url);
    }
  }

  dispose(): void {
    for (const url of [...this.#pool.keys()]) this.#drop(url);
    this.#pool.clear();
  }

  #drop(url: RelayUrl): void {
    const pooled = this.#pool.get(url);
    if (!pooled) return;
    // タイマーが残ったまま消すと、閉じたはずのリレーへ永遠に再接続し続ける
    // ゾンビタイマーになる (ADR-0021)。
    if (pooled.timer !== null) this.#scheduler.clearTimeout(pooled.timer);
    pooled.offClose?.();
    pooled.connection?.close();
    this.#pool.delete(url);
  }

  /**
   * ソケットが自らの意思とは無関係に死んだときの通知先 (`RelayConnection.onClose`)。
   * 予算 (ADR-0021) を即座に解放するが、購読の `onClosed` はここでは呼ばない —
   * 接続側 (`WebSocketRelayConnection.fail()` / `FakeRelayConnection.die()`) が
   * 既に全ハンドラへ配り終えている。二重に呼ぶと `incomplete.unreachableRelays`
   * が二重計上される。
   *
   * 末尾で再接続をスケジュールする (ADR-0021) — 誰も再購読を頼んでいないのに
   * ソケットが死んだままになる状態を作らない。
   */
  #onConnectionDied(url: RelayUrl): void {
    const pooled = this.#pool.get(url);
    if (!pooled) return;
    pooled.offClose?.();
    pooled.offClose = null;
    pooled.connection = null;
    for (const entry of pooled.entries) entry.subscription = null;
    this.#scheduleReconnect(url);
  }

  /**
   * 指数バックオフ + ジッタで再接続タイマーを積む (ADR-0021)。
   *
   * ジッタが無いと、同時に死んだ 30 本のリレーへの再接続が同期し、復帰の
   * 瞬間に自分でバーストを作ってしまう。`0.5〜1.5` 倍の範囲でずらす。
   */
  #scheduleReconnect(url: RelayUrl): void {
    const pooled = this.#pool.get(url);
    if (!pooled || pooled.connection || pooled.timer !== null) return;
    if (pooled.entries.size === 0) return; // 誰も待っていない

    const base = Math.min(
      RECONNECT_BASE_MS * 2 ** pooled.attempts,
      RECONNECT_MAX_MS,
    );
    const delay = base * (0.5 + this.#random());
    pooled.attempts += 1;
    pooled.timer = this.#scheduler.setTimeout(() => {
      pooled.timer = null;
      this.#reconnect(url);
    }, delay);
  }

  /**
   * 実際の再接続の試行。失敗しても外へは投げない — 呼び出し元 (タイマー・
   * `retryNow()`) は同期的な戻り値以外の失敗経路を持たないので、ここで
   * 吸収してバックオフを積み直す (プールは何をやっても例外を投げない、と
   * いう既存の保証を再接続でも保つ)。
   *
   * 切断中に流れたイベントを `since` で埋めない: 元のフィルタをそのまま
   * 張り直す。スリープ復帰で数時間分を `since` で埋めると、500 件上限
   * (ADR-0011) を即座に食いつぶし、ユーザーが実際に見ていたものを押し出す。
   * 元のフィルタが持つ `limit` を使って最新 N 件を取り直せば十分で、
   * 間を埋めるのはページネーションの役目 (`EventStore` が重複を吸収する)。
   *
   * `connect()` の失敗と `connection.subscribe()` の失敗を分けて扱う —
   * `subscribe()` (新規購読の経路) と同じ区別。前者はソケットそのものが
   * 使えないので丸ごと再試行、後者は「ソケットは生きているが特定の REQ
   * だけ失敗した」なので、その接続は保持したまま該当エントリだけ
   * `onClosed` で報告する。ここを一つの try/catch にまとめてしまうと、
   * 複数エントリが相乗りしている再接続で 1 エントリの REQ 失敗が原因で
   * せっかく繋がった生きているソケットごと巻き戻ってしまう。
   */
  #reconnect(url: RelayUrl): void {
    const pooled = this.#pool.get(url);
    if (!pooled || pooled.connection || pooled.entries.size === 0) return;

    // 枠が無ければ諦めず、あとでもう一度試す。生きている接続から枠を
    // 奪ってはいけない (ADR-0021)。`{ reserved: true }` で開いたエントリ
    // (Task 11, ブートストラップ専用) もここでは特別扱いしない —
    // 予約は最初の `subscribe()` 呼び出し限りで、死んで再接続待ちになった
    // 後まで持ち越さない。許容できるのは、ここで待たされている間
    // `collect()` のタイムアウトがその URL を見限って settle させ、
    // 対応する `PooledSubscription.close()` が待っているエントリを消して
    // `#scheduleReconnect` の「誰も待っていない」ガードで止まるから —
    // 予約を再接続にまで広げるより、ハングせず縮退させる方を選んだ。
    if (this.size >= this.#maxConnections) {
      this.#scheduleReconnect(url);
      return;
    }

    let connection: RelayConnection;
    try {
      connection = this.#options.connect(url);
    } catch {
      this.#scheduleReconnect(url);
      return;
    }

    pooled.connection = connection;
    pooled.offClose = connection.onClose(() => this.#onConnectionDied(url));
    pooled.attempts = 0;
    this.#recordPeak();

    for (const entry of pooled.entries) {
      try {
        entry.subscription = connection.subscribe(
          entry.filters,
          entry.handlers,
        );
      } catch {
        entry.subscription = null;
        entry.handlers.onClosed("relay unavailable");
      }
    }
  }
}
