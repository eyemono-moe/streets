import type {
  RelayConnection,
  RelayFilter,
  RelaySubscription,
  RelayUrl,
} from "../relay/relay-connection";
import { normalizeRelayUrl } from "../relay/relay-url";
import { FALLBACK_RELAYS } from "./default-relays";
import type { EventStore } from "./event-store";
import { planQuery } from "./query-plan";
import type { RoutingTable } from "./routing-table";

/**
 * 配信されるのはイベント本体ではなく id (ADR-0024)。
 * 本体は EventStore にあり、セクションは store.get(id) で引く。
 */
export type SectionDelivery = {
  onEvent: (id: string, relay: RelayUrl) => void;
  onRelayComplete: (relay: RelayUrl) => void;
  onRelayUnreachable: (relay: RelayUrl) => void;
};

export type SectionHandle = {
  /** このセクションが待っているリレー。完了判定の母集合になる */
  readonly relays: RelayUrl[];
  readonly unroutableAuthors: number;
  close(): void;
};

export type SubscriptionManagerOptions = {
  store: EventStore;
  routing: RoutingTable;
  connect: (url: RelayUrl) => RelayConnection;
  fallbackRelays?: readonly RelayUrl[];
};

type PooledConnection = {
  connection: RelayConnection;
  refCount: number;
};

/**
 * すべてのリレー接続と購読を所有する (ADR-0023)。
 * セクションは自分で接続しない。
 *
 * この計画では購読のマージも 30 接続上限も行わない (後続 #3)。
 * ここが提供するのは「著者ごとのルーティング」と
 * 「同じリレー URL への接続を全セクションで共有すること」の 2 つ。
 */
export class SubscriptionManager {
  readonly #options: SubscriptionManagerOptions;
  readonly #pool = new Map<RelayUrl, PooledConnection>();

  constructor(options: SubscriptionManagerOptions) {
    this.#options = options;
  }

  get connectionCount(): number {
    return this.#pool.size;
  }

  subscribe(
    filters: RelayFilter[],
    relays: RelayUrl[] | undefined,
    delivery: SectionDelivery,
  ): SectionHandle {
    const fallbackRelays = this.#options.fallbackRelays ?? FALLBACK_RELAYS;

    const perRelay = new Map<RelayUrl, RelayFilter[]>();
    let unroutableAuthors = 0;

    if (relays) {
      // 明示指定は Outbox ルーティングをバイパスする (ADR-0005)
      for (const raw of relays) {
        const url = normalizeRelayUrl(raw);
        if (url) perRelay.set(url, filters);
      }
    } else {
      const plan = planQuery({
        filters,
        writeRelaysFor: (pubkey) =>
          this.#options.routing.writeRelaysFor(pubkey),
        fallbackRelays,
      });
      for (const [url, planned] of plan.perRelay) perRelay.set(url, planned);
      unroutableAuthors = plan.unroutableAuthors.length;
    }

    let closed = false;
    const opened: { url: RelayUrl; subscription: RelaySubscription }[] = [];

    // #acquire / connection.subscribe が既に確保済みの接続の後で失敗すると、
    // その接続はどのセクションからも参照されないまま pool に残り続ける
    // (このセクションはハンドルを受け取れず close() できないため)。
    // ここまでに開いた分は同じ経路 (subscription.close + #release) で
    // 巻き戻してから例外を再送出する。
    try {
      for (const [url, relayFilters] of perRelay) {
        const connection = this.#acquire(url);
        const subscription = connection.subscribe(relayFilters, {
          onEvent: (event) => {
            if (closed) return;
            if (this.#options.store.put(event, url) === "rejected") return;
            delivery.onEvent(event.id, url);
          },
          onEose: () => {
            if (!closed) delivery.onRelayComplete(url);
          },
          onClosed: () => {
            if (!closed) delivery.onRelayUnreachable(url);
          },
        });
        opened.push({ url, subscription });
      }
    } catch (error) {
      closed = true;
      for (const { url, subscription } of opened) {
        subscription.close();
        this.#release(url);
      }
      throw error;
    }

    return {
      relays: [...perRelay.keys()],
      unroutableAuthors,
      close: () => {
        if (closed) return;
        closed = true;
        for (const { url, subscription } of opened) {
          subscription.close();
          this.#release(url);
        }
      },
    };
  }

  dispose(): void {
    for (const pooled of this.#pool.values()) pooled.connection.close();
    this.#pool.clear();
  }

  #acquire(url: RelayUrl): RelayConnection {
    const pooled = this.#pool.get(url);
    if (pooled) {
      pooled.refCount += 1;
      return pooled.connection;
    }
    const connection = this.#options.connect(url);
    this.#pool.set(url, { connection, refCount: 1 });
    return connection;
  }

  #release(url: RelayUrl): void {
    const pooled = this.#pool.get(url);
    if (!pooled) return;
    pooled.refCount -= 1;
    if (pooled.refCount > 0) return;
    pooled.connection.close();
    this.#pool.delete(url);
  }
}
