import type {
  RelayConnection,
  RelayFilter,
  RelaySubscription,
  RelaySubscriptionHandlers,
  RelayUrl,
} from "../relay/relay-connection";
import { MAX_CONNECTIONS } from "./default-relays";

export type PooledSubscription = { close(): void };

export type ConnectionPoolOptions = {
  connect: (url: RelayUrl) => RelayConnection;
  /** アプリ全体で同時に開く接続の上限 (ADR-0011)。既定は MAX_CONNECTIONS */
  maxConnections?: number;
};

/** 1 本の `subscribe()` 呼び出しに対応する登録。 */
type Entry = {
  filters: RelayFilter[];
  handlers: RelaySubscriptionHandlers;
  subscription: RelaySubscription | null;
};

/**
 * 1 つの URL に対するプールの状態。`connection` が `null` なのは
 * 接続を試みて失敗した場合 — エントリはこの URL を諦めていないので
 * `#pool` からは消さない (Task 9 の再接続対象として残す)。
 */
type Pooled = {
  connection: RelayConnection | null;
  entries: Set<Entry>;
  /** 接続の死亡通知の購読解除。まだ死亡検出を配線していないので現状は
   * 常に null (Task 8)。 */
  offClose: (() => void) | null;
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

  constructor(options: ConnectionPoolOptions) {
    this.#options = options;
  }

  /** 生きている接続の本数だけを数える (ADR-0021: 死んだ接続は予算を占有しない)。 */
  get size(): number {
    let open = 0;
    for (const pooled of this.#pool.values()) {
      if (pooled.connection) open += 1;
    }
    return open;
  }

  /**
   * 予算に空きが無ければ `undefined` を返す — これは「新しい URL を開こうと
   * したが枠が無かった」場合だけに限られる。既に開いている (または開こうと
   * 試みて失敗し記録だけ残っている) URL への追加の購読は、新しいソケットを
   * 要求しないので予算に関係なく常に受け付ける。
   *
   * 接続や購読の確立に失敗しても例外は外に投げない — `handlers.onClosed(...)`
   * に変換して同期的に伝える。これにより、30 本のうち 1 本が死んでいるだけで
   * 呼び出し元 (SectionReader) が例外で壊れることがなくなる。
   */
  subscribe(
    url: RelayUrl,
    filters: RelayFilter[],
    handlers: RelaySubscriptionHandlers,
  ): PooledSubscription | undefined {
    const budget = this.#options.maxConnections ?? MAX_CONNECTIONS;

    let pooled = this.#pool.get(url);
    if (!pooled) {
      if (this.size >= budget) return undefined;

      pooled = { connection: null, entries: new Set(), offClose: null };
      this.#pool.set(url, pooled);
      try {
        pooled.connection = this.#options.connect(url);
      } catch {
        // connection は null のまま。#pool からは消さない (Task 9 が
        // 後で再接続を試みる対象として残す)。
      }
    }

    const entry: Entry = { filters, handlers, subscription: null };
    pooled.entries.add(entry);

    if (pooled.connection) {
      try {
        entry.subscription = pooled.connection.subscribe(filters, handlers);
      } catch {
        entry.subscription = null;
      }
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

  dispose(): void {
    for (const url of [...this.#pool.keys()]) this.#drop(url);
    this.#pool.clear();
  }

  #drop(url: RelayUrl): void {
    const pooled = this.#pool.get(url);
    if (!pooled) return;
    pooled.offClose?.();
    pooled.connection?.close();
    this.#pool.delete(url);
  }
}
