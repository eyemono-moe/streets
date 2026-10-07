import type { RelayUrl } from "../relay/relay-connection";
import { createBatchedLookup } from "./batched-lookup";
import type { Scheduler } from "./connection-pool";
import type { EventStore } from "./event-store";
import type { SubscriptionManager } from "./subscription-manager";

export type EventRequests = {
  /**
   * この id のイベントを要求する (取得済みなら何もしない)。`relayHint` は
   * 受け取るが使わない —— リレーが自由に書ける値で信頼性が未検討のため、
   * 意図的に捨てていることを引数として明示する。
   */
  request(id: string, relayHint?: RelayUrl): void;
  /**
   * `id` を要求済みでバッチも片付いたのに `store` に無い、を表す (未要求
   * なら `false`)。`fetchOnce` は必ず解決するので取得中と区別できる。
   */
  isUnresolved(id: string): boolean;
  /**
   * バッチが片付く (`fetchOnce` 解決) たびに呼ばれるが、どの id かは
   * 通知しない。呼び出し側は自分の id を `store`/`isUnresolved` から引き直す。
   */
  subscribe(listener: () => void): () => void;
  /**
   * 直近バッチの `ids` 件数と観測史上の最大。1 バッチ = 1 フィルタ全件分
   * なので、これで NIP-11 の `max_message_length` 超過 (超えるとリレーが
   * 拒否し `isUnresolved` が原因不明のまま一斉に立つ) に迫っていないか分かる。
   */
  readonly lastBatchSize: number;
  readonly maxBatchSize: number;
  dispose(): void;
};

export type CreateEventRequestsOptions = {
  store: EventStore;
  manager: SubscriptionManager;
  /** バッチ窓のタイマー注入口 (テスト用)。既定は実タイマーで、読み取り層は実タイマーを直接掴まない規約に合わせる。 */
  scheduler?: Scheduler;
};

/**
 * まとめる窓の長さ (200ms)。カラムが一度に描画する数十件の `<EventView>` が
 * ほぼ同時期に `request()` を呼ぶので、それらを 1 本の REQ にまとめる。
 */
export const EVENT_BATCH_MS = 200;

/**
 * 関連イベント (返信元・引用先・リポスト対象) 要求のコアレッサ。
 * `isUnresolved` があるのは、返信元などは「読み込み中」と「見つからない
 * (削除・未着)」を画面で描き分ける必要があるため。
 */
export const createEventRequests = (
  options: CreateEventRequestsOptions,
): EventRequests => {
  /**
   * 要求済みでバッチが片付いた id。ここにあって store に無ければ
   * 「見つからなかった」と言い切れる。`request()` は再要求時にここから
   * 削除する —— スクロールアウト後の再マウントで同じ id が再要求されたとき、
   * 落とさないと前回の「見つからなかった」を返し続ける。
   */
  const settled = new Set<string>();
  const lookup = createBatchedLookup<string>({
    manager: options.manager,
    scheduler: options.scheduler,
    windowMs: EVENT_BATCH_MS,
    keyOf: (id) => id,
    plan: (ids) => ({ filters: [{ ids }] }),
    onFetched: (ids) => {
      for (const id of ids) settled.add(id);
    },
  });

  return {
    request(id, _relayHint) {
      if (lookup.disposed) return;
      // 既に EventStore にあるなら要求しない (無駄な REQ を作らない)。
      if (options.store.get(id)) return;
      settled.delete(id);
      lookup.enqueue(id);
    },

    isUnresolved(id) {
      // store にあるなら解決済み。settled に入っていても、後から別経路
      // (カラムの購読など) で届いていることがある。
      return settled.has(id) && !options.store.get(id);
    },

    subscribe: lookup.subscribe,
    get lastBatchSize() {
      return lookup.lastBatchSize;
    },
    get maxBatchSize() {
      return lookup.maxBatchSize;
    },
    dispose: lookup.dispose,
  };
};
