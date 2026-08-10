import type { RelayConnection, RelayUrl } from "../relay/relay-connection";
import { type Scheduler, defaultScheduler } from "./connection-pool";
import type { EventPersistence } from "./event-persistence";
import { type EventRequests, createEventRequests } from "./event-requests";
import { EventStore } from "./event-store";
import {
  type CreateProfileRequestsOptions,
  type ProfileRequests,
  createProfileRequests,
} from "./profile-requests";
import { RoutingTable } from "./routing-table";
import { SubscriptionManager } from "./subscription-manager";

export type ReadLayerOptions = {
  connect: (url: RelayUrl) => RelayConnection;
  persistence: EventPersistence;
  fallbackRelays?: RelayUrl[];
  maxConnections?: number;
  /**
   * store・manager (= ConnectionPool)・coalescer の 4 者すべてがこの 1 つを
   * 共有する。呼び出し側が個別に別々の Scheduler を組み立てて 2 つ目を
   * どこかへ渡す経路を、型の形として作らない —— Task 6 が
   * `warmUpRouting`/`createProfileRequests` それぞれで踏んだ「store と別の
   * 時計を渡すと鮮度がかみ合わない」という規約違反を、ここでは物理的に
   * 起こしようがなくする。
   */
  scheduler?: Scheduler;
  random?: () => number;
};

export type ReadLayer = {
  /** 水和の完了。起動直後に 1 回 await する。失敗しない。 */
  ready: Promise<void>;
  manager: SubscriptionManager;
  routing: RoutingTable;
  events: EventRequests;
  profiles: ProfileRequests;
  /** 同期読み取りと診断のためだけ。書き込み口をアプリ側から呼ばない。 */
  readonly store: EventStore;
  dispose(): void;
};

/**
 * 読み取り層の合成ルート (spec 9 節)。`EventStore` はここでしか
 * `new` されない —— `createSection` はもう `store` を公開オプションとして
 * 受け取らず、`manager.store` を使う (`create-section.ts` 参照)。
 */
export const createReadLayer = (options: ReadLayerOptions): ReadLayer => {
  const scheduler = options.scheduler ?? defaultScheduler;
  const store = new EventStore({ scheduler, persistence: options.persistence });
  const routing = new RoutingTable(store);
  const manager = new SubscriptionManager({
    store,
    routing,
    connect: options.connect,
    fallbackRelays: options.fallbackRelays,
    maxConnections: options.maxConnections,
    scheduler,
    random: options.random,
  });
  const profileRequestsOptions: CreateProfileRequestsOptions = {
    store,
    manager,
    scheduler,
  };
  const profiles = createProfileRequests(profileRequestsOptions);
  const events = createEventRequests({ store, manager, scheduler });

  // `persistence.load()` は仕様上 reject しない実装だけを渡す契約だが、
  // ここで信用しきって `await` だけに任せると、その規約が守られなかった
  // 世界 (あるいは渡された stand-in が規約を破っている場合) で `ready` が
  // 永久に reject し、起動そのものが止まる。プライベートブラウジングで
  // 「キャッシュが無いだけ」のはずが「アプリが起動しない」に化けるのは
  // 受け入れられない (spec 7 節) ので、async 関数の中で吸収して
  // ready 自身は常に resolve する形にする。
  const ready = (async () => {
    try {
      const { events: persisted, deletedIds } =
        await options.persistence.load();
      store.hydrate(persisted, { deletedIds });
    } catch {
      // 何もしない — 水和が無いだけで、通常のウォームアップ経路が効く。
    }
  })();

  return {
    ready,
    manager,
    routing,
    events,
    profiles,
    store,
    dispose(): void {
      profiles.dispose();
      events.dispose();
      manager.dispose();
      options.persistence.dispose();
    },
  };
};
