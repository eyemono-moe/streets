import type { RelayFilter, RelayUrl } from "../relay/relay-connection";
import { type Scheduler, defaultScheduler } from "./connection-pool";
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
  const scheduler = options.scheduler ?? defaultScheduler;

  /** 今の窓でまだ `fetchOnce` していない id (重複排除は Set 自身が担う)。 */
  let pending = new Set<string>();
  let timer: ReturnType<Scheduler["setTimeout"]> | null = null;
  let disposed = false;
  const listeners = new Set<() => void>();

  /**
   * 要求済みでバッチが片付いた id。ここにあって store に無ければ
   * 「見つからなかった」と言い切れる。追加専用ではなく、`request()` は
   * 再要求時にここから削除する —— スクロールアウト後の再マウントで同じ id
   * が再要求されたとき、落とさないと前回の「見つからなかった」を返し続ける。
   */
  const settled = new Set<string>();

  /**
   * 窓を閉じて `fetchOnce` を 1 本投げる。`pending` を新しい Set に差し替え、
   * 解決前に来た `request()` は次のバッチへ回す。
   */
  let lastBatchSize = 0;
  let maxBatchSize = 0;

  const flush = (): void => {
    timer = null;
    // タイマーは `request()` が `pending` へ足した直後にしか張らないので、
    // ここへ空で来ることは無い。守りとして残すが、これに依存した経路は無い。
    if (pending.size === 0) return;
    const ids = [...pending];
    pending = new Set();
    lastBatchSize = ids.length;
    if (ids.length > maxBatchSize) maxBatchSize = ids.length;

    const filters: RelayFilter[] = [{ ids }];
    void options.manager.fetchOnce(filters).then(() => {
      // dispose() 後に解決したバッチは誰にも通知しない —— リスナー自体を
      // dispose() で空にしているので実害は無いが、意図を明示しておく。
      if (disposed) return;
      for (const id of ids) settled.add(id);
      for (const listener of listeners) listener();
    });
  };

  return {
    request(id, _relayHint) {
      if (disposed) return;
      // 既に EventStore にあるなら要求しない (無駄な REQ を作らない)。
      if (options.store.get(id)) return;
      // 再要求は新しい探索の開始。settled は追加専用なので、ここで落とさ
      // ないと isUnresolved が探している最中も前回の「見つからなかった」
      // を返し続ける。
      settled.delete(id);
      pending.add(id);
      if (timer === null) {
        timer = scheduler.setTimeout(flush, EVENT_BATCH_MS);
      }
    },

    isUnresolved(id) {
      // store にあるなら解決済み。settled に入っていても、後から別経路
      // (カラムの購読など) で届いていることがある。
      return settled.has(id) && !options.store.get(id);
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
