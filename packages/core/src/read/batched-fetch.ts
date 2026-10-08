import type { RelayFilter, RelayUrl } from "../relay/relay-connection";
import { type Scheduler, defaultScheduler } from "./scheduler";
import type { SubscriptionManager } from "./subscription-manager";

/** 行き先が決まらないときは `relays` を省く。`[]` は「リレー 0 本」になり、どこへも送られない。 */
export type FetchRequest = { filters: RelayFilter[]; relays?: RelayUrl[] };

export type BatchedFetchConfig<Item> = {
  manager: SubscriptionManager;
  scheduler?: Scheduler;
  /** 行き先やフィルタがキーごとに違うもの（投票・フォロー一覧）は束ねられないので、窓を待たずに `"immediate"` で 1 件ずつ取る。 */
  batchWindowMs: number | "immediate";
  keyOf(item: Item): string;
  toRequest(items: Item[]): FetchRequest;
  /** listener より先に呼ぶ。listener が読む「取った」印（`markReplaceableFetched` など）をここで付けるため。 */
  markFetched?(items: Item[]): void;
  onFailed?(items: Item[]): void;
};

export type BatchedFetch<Item> = {
  enqueue(item: Item): boolean;
  isInflight(key: string): boolean;
  readonly disposed: boolean;
  /** どのキーが片付いたかは渡さない。読む側はどうせ store から引き直す。 */
  subscribe(listener: () => void): () => void;
  /** 1 回に束ねる件数が NIP-11 の `max_message_length` に迫っていないかを、Devtools で見るため。 */
  readonly lastBatchSize: number;
  readonly maxBatchSize: number;
  dispose(): void;
};

/**
 * 手元にあるかの判定と取り直しの間隔は、ここでは持たない。種類ごとに条件が違い
 * （プロフィールは鮮度、反応の数は一度取ったら終わり、など）、ここへ寄せると
 * 種類ごとの分岐が戻ってくる。
 */
export const createBatchedFetch = <Item>(
  config: BatchedFetchConfig<Item>,
): BatchedFetch<Item> => {
  const scheduler = config.scheduler ?? defaultScheduler;
  let pending = new Map<string, Item>();
  let timer: ReturnType<Scheduler["setTimeout"]> | null = null;
  let disposed = false;
  let lastBatchSize = 0;
  let maxBatchSize = 0;
  const listeners = new Set<() => void>();
  const inflight = new Set<string>();

  const flush = (): void => {
    timer = null;
    if (pending.size === 0) return;
    const entries = [...pending];
    pending = new Map();
    const keys = entries.map(([key]) => key);
    const items = entries.map(([, item]) => item);
    lastBatchSize = items.length;
    if (items.length > maxBatchSize) maxBatchSize = items.length;
    for (const key of keys) inflight.add(key);

    const { filters, relays } = config.toRequest(items);
    const release = () => {
      for (const key of keys) inflight.delete(key);
    };
    void config.manager
      .fetchOnce(filters, relays === undefined ? undefined : { relays })
      .then(
        () => {
          release();
          if (disposed) return;
          config.markFetched?.(items);
          for (const listener of listeners) listener();
        },
        () => {
          release();
          config.onFailed?.(items);
        },
      );
  };

  return {
    enqueue(item) {
      if (disposed) return false;
      pending.set(config.keyOf(item), item);
      if (config.batchWindowMs === "immediate") {
        flush();
      } else if (timer === null) {
        timer = scheduler.setTimeout(flush, config.batchWindowMs);
      }
      return true;
    },
    isInflight: (key) => inflight.has(key),
    get disposed() {
      return disposed;
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
      pending = new Map();
      listeners.clear();
    },
  };
};
