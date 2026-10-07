import type { RelayFilter, RelayUrl } from "../relay/relay-connection";
import { type Scheduler, defaultScheduler } from "./connection-pool";
import type { SubscriptionManager } from "./subscription-manager";

/** `fetchOnce` へ渡す 1 回ぶん。`relays` を省くと既定の行き先へ問い合わせる。 */
export type FetchPlan = { filters: RelayFilter[]; relays?: RelayUrl[] };

export type BatchedLookupConfig<Item> = {
  manager: SubscriptionManager;
  scheduler?: Scheduler;
  /**
   * 窓の長さ (ms)。`"immediate"` は窓を開かず、`enqueue` のたびに 1 件だけで
   * 取りにいく (行き先やフィルタがキーごとに違い、束ねられないもの用)。
   */
  windowMs: number | "immediate";
  /** 重複排除と `isInflight` に使うキー。 */
  keyOf(item: Item): string;
  /** 窓の中にたまったものを `fetchOnce` へ渡す形にする。キーの束ね方はここが決める。 */
  plan(items: Item[]): FetchPlan;
  /** 取り終えて、listener を呼ぶ前に呼ぶ。`dispose()` 後は呼ばれない。 */
  onFetched?(items: Item[]): void;
  /** `fetchOnce` が失敗したとき。 */
  onFailed?(items: Item[]): void;
};

export type BatchedLookup<Item> = {
  /** 窓へ足す。`dispose()` 後は何もせず `false`。 */
  enqueue(item: Item): boolean;
  /** 取りにいっている最中のキーか。返事を待つ間の重ね要求を弾くのに使う。 */
  isInflight(key: string): boolean;
  readonly disposed: boolean;
  /** 1 本片付くたびに listener を呼ぶ。どのキーかは知らせない。 */
  subscribe(listener: () => void): () => void;
  /** 直近の 1 回の件数と観測史上の最大。NIP-11 の `max_message_length` に迫っていないか見る。 */
  readonly lastBatchSize: number;
  readonly maxBatchSize: number;
  dispose(): void;
};

/**
 * 一度きりの取得のまとめ役の共通部分。キーをためる → 窓が閉じたらまとめて
 * `fetchOnce` → 取れたことを覚えて listener へ知らせる。キーの形・フィルタ・
 * 手元にあるかの判定・取り直しの方針は、呼ぶ側が持つ。
 */
export const createBatchedLookup = <Item>(
  config: BatchedLookupConfig<Item>,
): BatchedLookup<Item> => {
  const scheduler = config.scheduler ?? defaultScheduler;
  // 解決前に来た要求を今回の束へ混ぜず次の束へ回すため、flush のたびに作り直す。
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

    const { filters, relays } = config.plan(items);
    const release = () => {
      for (const key of keys) inflight.delete(key);
    };
    void config.manager
      .fetchOnce(filters, relays === undefined ? undefined : { relays })
      .then(
        () => {
          release();
          // dispose() 後に解決した束は誰にも知らせない。
          if (disposed) return;
          config.onFetched?.(items);
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
      if (config.windowMs === "immediate") {
        flush();
      } else if (timer === null) {
        timer = scheduler.setTimeout(flush, config.windowMs);
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
