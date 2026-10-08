import type { RequestOptions } from "./address-requests";
import { createBatchedFetch } from "./batched-fetch";
import { isStale, policyFor } from "./cache-policy";
import type { EventStore } from "./event-store";
import { type Scheduler, defaultScheduler } from "./scheduler";
import type { SubscriptionManager } from "./subscription-manager";

const PROFILE_KIND = 0;
const HEX_64 = /^[0-9a-f]{64}$/;

export type ProfileRequests = {
  /**
   * この pubkey のプロフィールを要求する。取ってから古くなっていなければ何もしない。
   * `refresh` なら古さに関係なく取り直す。
   */
  request(pubkey: string, options?: RequestOptions): void;
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
  const batch = createBatchedFetch<string>({
    manager: options.manager,
    scheduler,
    batchWindowMs: PROFILE_BATCH_MS,
    keyOf: (pubkey) => pubkey,
    toRequest: (authors) => ({ filters: [{ kinds: [PROFILE_KIND], authors }] }),
    markFetched: (authors) => {
      for (const author of authors) {
        options.store.markReplaceableFetched(PROFILE_KIND, author);
      }
    },
  });

  return {
    request(pubkey, requestOptions) {
      // 公開鍵でない値を著者に入れると、リレーは束ねたほかの人の分ごと断る。
      if (!HEX_64.test(pubkey)) return;
      // 既に新鮮なら要求しない。`fetchedAt` が無い (未取得) なら isStale を呼ぶまでもなく要求する。
      const fetchedAt = options.store.replaceableFetchedAt(
        PROFILE_KIND,
        pubkey,
      );
      if (
        !requestOptions?.refresh &&
        fetchedAt !== undefined &&
        !isStale(policyFor(PROFILE_KIND), fetchedAt, scheduler.now())
      ) {
        return;
      }
      // 取りにいっている最中なら重ねない。返事を待つ間は取った時刻がまだ更新されない。
      if (batch.isInflight(pubkey)) return;
      batch.enqueue(pubkey);
    },
    subscribe: batch.subscribe,
    get lastBatchSize() {
      return batch.lastBatchSize;
    },
    get maxBatchSize() {
      return batch.maxBatchSize;
    },
    dispose: batch.dispose,
  };
};
