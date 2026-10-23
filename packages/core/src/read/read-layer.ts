import type { RelayConnection, RelayUrl } from "../relay/relay-connection";
import { createAddressRequests } from "./address-requests";
import { createDeletionRequests } from "./deletion-requests";
import {
  type CreateEngagementRequestsOptions,
  type EngagementRequests,
  createEngagementRequests,
} from "./engagement-requests";
import type { EventPersistence } from "./event-persistence";
import { type EventRequests, createEventRequests } from "./event-requests";
import { EventStore } from "./event-store";
import { createFollowListRequests } from "./follow-list-requests";
import { type ReadLookups, createReadLookups } from "./lookups";
import { createPollRequests } from "./poll-requests";
import {
  type CreateProfileRequestsOptions,
  type ProfileRequests,
  createProfileRequests,
} from "./profile-requests";
import { RoutingTable } from "./routing-table";
import { type Scheduler, defaultScheduler } from "./scheduler";
import { REPLAN_BATCH_MS, SubscriptionManager } from "./subscription-manager";

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
  /** 張り直しをまとめる窓。既定は `REPLAN_BATCH_MS`。テストは 0 にして同期実行できる。 */
  replanBatchMs?: number;
  /** ローカルネットワークのリレーへ、許したもの以外も繋ぐか（`ConnectionPoolOptions` 参照）。 */
  allowLocalNetwork?: boolean;
  /** リレーごとの同時購読の枠（`ConnectionPoolOptions` 参照）。 */
  maxSubscriptions?: (url: RelayUrl) => number | null | undefined;
  /** 枠が埋まって REQ を待たせたときの通知（Devtools で数える）。 */
  onQueued?: (url: RelayUrl) => void;
};

export type ReadLayer = {
  /** 水和の完了。起動直後に 1 回 await する。失敗しない。 */
  ready: Promise<void>;
  manager: SubscriptionManager;
  routing: RoutingTable;
  events: EventRequests;
  profiles: ProfileRequests;
  engagements: EngagementRequests;
  /** 画面が 1 件ずつ読む口。要求器（events など）を画面から直に呼ばないためのもの。 */
  lookups: ReadLookups;
  /** 同期読み取りと診断のためだけ。書き込み口をアプリ側から呼ばない。 */
  readonly store: EventStore;
  dispose(): void;
};

/**
 * 使われていないイベントをメモリから捨てる間隔と、捨てずに残す新しさ。届いて
 * すぐのものは、描いている部品が取ったばかりのこと（本文中の引用など）がある。
 */
export const SWEEP_INTERVAL_MS = 60_000;
export const SWEEP_IDLE_MS = 10 * 60_000;

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
    replanBatchMs: options.replanBatchMs ?? REPLAN_BATCH_MS,
    allowLocalNetwork: options.allowLocalNetwork,
    maxSubscriptions: options.maxSubscriptions,
    onQueued: options.onQueued,
  });
  const profileRequestsOptions: CreateProfileRequestsOptions = {
    store,
    manager,
    scheduler,
  };
  const profiles = createProfileRequests(profileRequestsOptions);
  const events = createEventRequests({ store, manager, scheduler });
  const addresses = createAddressRequests({ store, manager, scheduler });
  const polls = createPollRequests({ manager });
  const followLists = createFollowListRequests({
    store,
    manager,
    scheduler,
  });
  const engagementRequestsOptions: CreateEngagementRequestsOptions = {
    manager,
    scheduler,
  };
  const engagements = createEngagementRequests(engagementRequestsOptions);
  const deletions = createDeletionRequests({ store, manager, scheduler });

  const offSweep = store.onSweep((dropped) => {
    const ids = dropped.map((event) => event.id);
    // 捨てたものが指していた先は、反応や回答の数が欠けたかもしれない。
    const targets = [
      ...ids,
      ...dropped.flatMap((event) =>
        event.tags.flatMap((tag) => (tag[0] === "e" && tag[1] ? [tag[1]] : [])),
      ),
    ];
    events.forget(ids);
    deletions.forget(ids);
    engagements.forget(targets);
    polls.forget(targets);
  });
  let sweepTimer: ReturnType<typeof setTimeout> | undefined;
  const scheduleSweep = () => {
    sweepTimer = scheduler.setTimeout(() => {
      store.sweep(SWEEP_IDLE_MS);
      scheduleSweep();
    }, SWEEP_INTERVAL_MS);
  };
  scheduleSweep();

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
    lookups: createReadLookups({
      store,
      events,
      addresses,
      profiles,
      engagements,
      deletions,
      polls,
      followLists,
    }),
    store,
    dispose(): void {
      offReplaceableChanged();
      offSweep();
      if (sweepTimer !== undefined) scheduler.clearTimeout(sweepTimer);
      if (routingReplanTimer !== undefined) {
        scheduler.clearTimeout(routingReplanTimer);
        routingReplanTimer = undefined;
      }
      profiles.dispose();
      events.dispose();
      addresses.dispose();
      polls.dispose();
      followLists.dispose();
      engagements.dispose();
      deletions.dispose();
      manager.dispose();
      options.persistence.dispose();
    },
  };
};
