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
  // dispose() が孤児化させる SectionHandle を無効化するための世代カウンタ。
  // handle は生成時の世代を覚えておき、close() 時点で現在の世代と食い違って
  // いたら何もしない。世代が進んでいるということは、dispose() で pool が
  // 丸ごと作り直された後だということ — その handle が握っていた url は
  // 同じ文字列でも「別の接続」を指しうるので、素朴に #release すると
  // dispose() 後に新しく張り直された接続を誤って閉じてしまう。
  #generation = 0;

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
    const generation = this.#generation;

    const perRelay = new Map<RelayUrl, RelayFilter[]>();
    let unroutableAuthors = 0;

    if (relays) {
      // 明示指定は Outbox ルーティングをバイパスする (ADR-0005)
      for (const raw of relays) {
        const url = normalizeRelayUrl(raw);
        if (url) {
          // planQuery (query-plan.ts) と同じく、リレーごとに配列を分ける。
          // 同じ配列インスタンスを複数リレーで共有すると、一方への変更が
          // 他方に漏れる (コミット 7416368 で routed 経路から潰したのと
          // 同じ危険を、この bypass 経路で再導入してしまう)。
          perRelay.set(url, [...filters]);
        } else {
          // 正規化できない URL を黙って捨てると「どこも見ていないのに
          // settled」という区別のつかない劣化になる (ADR-0011: 黙って
          // 欠落させてはならない)。最初から到達不能だったものとして報告する。
          // RelayUrl は string のエイリアスなので、正規化前の生文字列を渡す
          // ことに型的な不健全さはない。
          delivery.onRelayUnreachable(raw);
        }
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
    // #acquire が成功した時点で pool の refCount は上がっている。その直後の
    // connection.subscribe() が投げた場合、その url は opened にはまだ
    // 積まれていない — opened だけを巻き戻すと、この url の refCount が
    // 上がったまま誰にも #release されない (connect() 自体が投げるケースだけ
    // でなく、こちらも同じ「取得済みが孤児化する」バグなので別途追跡する)。
    const acquiredUrls: RelayUrl[] = [];

    try {
      for (const [url, relayFilters] of perRelay) {
        const connection = this.#acquire(url);
        acquiredUrls.push(url);
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
      for (const { subscription } of opened) subscription.close();
      for (const url of acquiredUrls) this.#release(url);
      throw error;
    }

    return {
      relays: [...perRelay.keys()],
      unroutableAuthors,
      close: () => {
        if (closed) return;
        closed = true;
        // dispose() が挟まっていたら、この handle が握っていた接続は
        // もう pool にいない (別の generation で作り直された可能性がある)。
        // 触らずに無視する — 触ると新しい世代の接続を誤って閉じかねない。
        if (generation !== this.#generation) return;
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
    this.#generation += 1;
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
