import type { RelayConnection, RelayUrl } from "../relay/relay-connection";
import { type Scheduler, defaultScheduler } from "./connection-pool";
import {
  type CreateEngagementRequestsOptions,
  type EngagementRequests,
  createEngagementRequests,
} from "./engagement-requests";
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
   * store・manager・coalescer 全員がこの 1 つを共有する。時計が別だと
   * `fetchedAt` の経過時間が動かないため、型の形で 1 つに縛る。
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
  engagements: EngagementRequests;
  /** 同期読み取りと診断のためだけ。書き込み口をアプリ側から呼ばない。 */
  readonly store: EventStore;
  dispose(): void;
};

/** kind:10002 のバーストを Outbox の再計画 1 回へ畳む窓。 */
export const ROUTING_REPLAN_BATCH_MS = 200;

/**
 * 読み取り層の合成ルート。`EventStore` はここでしか `new` されない ——
 * 他は `manager.store` 経由で参照する。
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
  const engagementRequestsOptions: CreateEngagementRequestsOptions = {
    manager,
    scheduler,
  };
  const engagements = createEngagementRequests(engagementRequestsOptions);

  let routingReplanTimer: ReturnType<typeof setTimeout> | undefined;
  const offReplaceableChanged = store.onReplaceableChanged((change) => {
    if (change.kind !== 10002 || routingReplanTimer !== undefined) return;
    routingReplanTimer = scheduler.setTimeout(() => {
      routingReplanTimer = undefined;
      manager.replan();
    }, ROUTING_REPLAN_BATCH_MS);
  });

  // `persistence.load()` は reject しない契約だが、それが破られた場合に
  // `ready` が永久に reject して起動が止まるのは避けたい —— 「キャッシュが
  // 無いだけ」が「起動しない」に化けないよう、ここで吸収して常に resolve する。
  const ready = (async () => {
    try {
      const { events: persisted, deletionRequests } =
        await options.persistence.load();
      // 削除依頼を先に索引しておくことで、依頼より後に到着した通常イベントにも
      // 著者と時刻の検証を同じ規則で適用できる。
      store.hydrate(persisted, { deletionRequests });
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
    engagements,
    store,
    dispose(): void {
      offReplaceableChanged();
      if (routingReplanTimer !== undefined) {
        scheduler.clearTimeout(routingReplanTimer);
        routingReplanTimer = undefined;
      }
      profiles.dispose();
      events.dispose();
      engagements.dispose();
      manager.dispose();
      options.persistence.dispose();
    },
  };
};
