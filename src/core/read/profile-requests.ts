import type { RelayFilter } from "../relay/relay-connection";
import { isStale, policyFor } from "./cache-policy";
import { type Scheduler, defaultScheduler } from "./connection-pool";
import type { EventStore } from "./event-store";
import type { SubscriptionManager } from "./subscription-manager";

const PROFILE_KIND = 0;

export type ProfileRequests = {
  /** この pubkey のプロフィールを要求する。既に取得済みなら何もしない。 */
  request(pubkey: string): void;
  /**
   * バッチが 1 本片付く (= `fetchOnce` が解決する) たびに呼ばれる。どの
   * pubkey が解決したかは通知しない —— `<Profile>` は自分の pubkey を
   * `store` から引き直せば済む。ポーリングを持たないため push 形にしてある。
   */
  subscribe(listener: () => void): () => void;
  /**
   * 直近バッチの `authors` 件数と観測史上の最大。1 バッチ = 1 フィルタ全件分
   * なので、これで NIP-11 の `max_message_length` 超過に迫っていないか分かる。
   * 超えるとリレーが拒否し、プロフィールが 1 つも届かず原因も分からなくなる。
   */
  readonly lastBatchSize: number;
  readonly maxBatchSize: number;
  dispose(): void;
};

export type CreateProfileRequestsOptions = {
  store: EventStore;
  manager: SubscriptionManager;
  /**
   * バッチ窓のタイマー注入口 (テスト用)。既定は実タイマー —— 読み取り層は
   * どこであれ実タイマーを直接掴まない規約。
   */
  scheduler?: Scheduler;
};

/**
 * まとめる窓の長さ。`NOTIFY_BATCH_MS` (16ms) とは目的が違うので揃えない ——
 * 短すぎると窓の開閉がイベント数に逆戻りし、長すぎると体感が遅れるため
 * 200ms でバランスを取る。
 */
const PROFILE_BATCH_MS = 200;

/**
 * プロフィール要求のコアレッサ。`<Profile>` はマウントごとに 1 件ずつ
 * `request(x)` を呼ぶ —— カラム単位で著者集合を購読する設計は採らない
 * (`items` が変わるたびに派生集合の識別子が変わり、購読を張り直すため)。
 */
export const createProfileRequests = (
  options: CreateProfileRequestsOptions,
): ProfileRequests => {
  const scheduler = options.scheduler ?? defaultScheduler;

  /** 今の窓でまだ `fetchOnce` していない pubkey (重複排除は Set 自身が担う)。 */
  let pending = new Set<string>();
  let timer: ReturnType<Scheduler["setTimeout"]> | null = null;
  let disposed = false;
  const listeners = new Set<() => void>();

  /**
   * `pending` を新しい Set に差し替えるのは、`fetchOnce` 解決前に来た新しい
   * `request()` を今回のバッチへ混ぜず次のバッチへ回すため。
   */
  let lastBatchSize = 0;
  let maxBatchSize = 0;

  const flush = (): void => {
    timer = null;
    if (pending.size === 0) return;
    const authors = [...pending];
    pending = new Set();
    lastBatchSize = authors.length;
    if (authors.length > maxBatchSize) maxBatchSize = authors.length;

    const filters: RelayFilter[] = [{ kinds: [0], authors }];
    void options.manager.fetchOnce(filters).then(() => {
      // dispose() 後に解決したバッチは誰にも通知しない —— リスナー自体を
      // dispose() で空にしているので実害は無いが、意図を明示しておく。
      if (disposed) return;
      for (const author of authors) {
        options.store.markReplaceableFetched(PROFILE_KIND, author);
      }
      for (const listener of listeners) listener();
    });
  };

  return {
    request(pubkey) {
      if (disposed) return;
      // 既に新鮮なら要求しない。`fetchedAt` が無い (未取得) なら isStale を呼ぶまでもなく要求する。
      const fetchedAt = options.store.replaceableFetchedAt(
        PROFILE_KIND,
        pubkey,
      );
      if (
        fetchedAt !== undefined &&
        !isStale(policyFor(PROFILE_KIND), fetchedAt, scheduler.now())
      ) {
        return;
      }
      pending.add(pubkey);
      if (timer === null) {
        timer = scheduler.setTimeout(flush, PROFILE_BATCH_MS);
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
      listeners.clear();
    },
  };
};
