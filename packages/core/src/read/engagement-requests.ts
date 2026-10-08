import { createBatchedFetch } from "./batched-fetch";
import type { Scheduler } from "./scheduler";
import type { SubscriptionManager } from "./subscription-manager";

export type EngagementRequests = {
  /** このイベント id の返信・リポスト・反応を要求する。要求済みなら何もしない。 */
  request(targetId: string): void;
  /**
   * バッチが 1 本片付く (= `fetchOnce` が解決する) たびに呼ばれる。
   * どのイベント id が解決したかは通知しない。
   */
  subscribe(listener: () => void): () => void;
  /**
   * 直近に送ったバッチの対象 id 件数と、観測史上の最大。
   */
  readonly lastBatchSize: number;
  readonly maxBatchSize: number;
  dispose(): void;
};

export type CreateEngagementRequestsOptions = {
  manager: SubscriptionManager;
  /**
   * バッチ窓のタイマー注入口 (テスト用)。既定は実タイマー
   * (`scheduler.ts` の `defaultScheduler` と同じ規約)。
   */
  scheduler?: Scheduler;
};

/**
 * まとめる窓の長さ。`profile-requests.ts` と同じ 200ms —— 複数のノート表示
 * が同時に engagement 要求を呼ぶ場合を想定している。
 */
const ENGAGEMENT_BATCH_MS = 200;

/**
 * 返信・リポスト・反応要求のコアレッサ。置換可能イベントではないため
 * 鮮度チェックは行わず、「一度要求した対象は二度要求しない」で足りる。
 */
export const createEngagementRequests = (
  options: CreateEngagementRequestsOptions,
): EngagementRequests => {
  /**
   * これまで要求した全 id (二度要求しない、刈り込まない)。engagement 0 件
   * は `EventStore` に残らず探索済みと言い当てられないため。
   */
  const requested = new Set<string>();
  const batch = createBatchedFetch<string>({
    manager: options.manager,
    scheduler: options.scheduler,
    batchWindowMs: ENGAGEMENT_BATCH_MS,
    keyOf: (targetId) => targetId,
    toRequest: (targetIds) => ({
      filters: [{ kinds: [1, 6, 7], "#e": targetIds }],
    }),
  });

  return {
    request(targetId) {
      if (batch.disposed || requested.has(targetId)) return;
      requested.add(targetId);
      batch.enqueue(targetId);
    },
    subscribe: batch.subscribe,
    get lastBatchSize() {
      return batch.lastBatchSize;
    },
    get maxBatchSize() {
      return batch.maxBatchSize;
    },
    dispose() {
      requested.clear();
      batch.dispose();
    },
  };
};
