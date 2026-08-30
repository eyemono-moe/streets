import type { RelayFilter } from "../relay/relay-connection";
import { type Scheduler, defaultScheduler } from "./connection-pool";
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
   * (`connection-pool.ts` の `defaultScheduler` と同じ規約)。
   */
  scheduler?: Scheduler;
};

/**
 * まとめる窓の長さ。
 *
 * profile-requests.ts と同じ 200ms。複数のノート表示が同時に engagement
 * 要求を呼び出す場合を想定している。
 */
const ENGAGEMENT_BATCH_MS = 200;

/**
 * 返信・リポスト・反応要求のコアレッサ。
 *
 * `fetchOnce` で複数のイベント id をまとめて 1 本のリクエストにする。
 * いずれも置換可能イベントではないため、鮮度チェックは行わない。
 * 代わりに「一度要求した対象は二度要求しない」で足りる。
 */
export const createEngagementRequests = (
  options: CreateEngagementRequestsOptions,
): EngagementRequests => {
  const scheduler = options.scheduler ?? defaultScheduler;

  /** 今の窓でまだ `fetchOnce` していないイベント id。 */
  let pending = new Set<string>();
  /**
   * これまで要求した全てのイベント id。一度要求したら二度は要求しない。
   *
   * `ProfileRequests` と違い刈り込まない。engagement が 0 件だった対象は
   * `EventStore` に何も残さないので、「探索済み」を store 側から言い当てる
   * 手段が無く、ここで覚えていないと窓が回るたびに引き直しになる。
   */
  let requested = new Set<string>();
  let timer: ReturnType<Scheduler["setTimeout"]> | null = null;
  let disposed = false;
  const listeners = new Set<() => void>();

  let lastBatchSize = 0;
  let maxBatchSize = 0;

  const flush = (): void => {
    timer = null;
    if (pending.size === 0) return;
    const targetIds = [...pending];
    pending = new Set();
    lastBatchSize = targetIds.length;
    if (targetIds.length > maxBatchSize) maxBatchSize = targetIds.length;

    const filters: RelayFilter[] = [{ kinds: [1, 6, 7], "#e": targetIds }];
    void options.manager.fetchOnce(filters).then(() => {
      if (disposed) return;
      for (const listener of listeners) listener();
    });
  };

  return {
    request(targetId) {
      if (disposed) return;
      if (requested.has(targetId)) return;
      requested.add(targetId);
      pending.add(targetId);
      if (timer === null) {
        timer = scheduler.setTimeout(flush, ENGAGEMENT_BATCH_MS);
      }
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    get lastBatchSize() {
      return lastBatchSize;
    },

    get maxBatchSize() {
      return maxBatchSize;
    },

    dispose() {
      disposed = true;
      if (timer !== null) {
        scheduler.clearTimeout(timer);
        timer = null;
      }
      pending = new Set();
      requested = new Set();
      listeners.clear();
    },
  };
};
