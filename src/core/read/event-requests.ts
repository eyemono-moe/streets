import type { RelayFilter, RelayUrl } from "../relay/relay-connection";
import { type Scheduler, defaultScheduler } from "./connection-pool";
import type { EventStore } from "./event-store";
import type { SubscriptionManager } from "./subscription-manager";

export type EventRequests = {
  /**
   * この id のイベントを要求する。既に取得済みなら何もしない。
   *
   * `relayHint` は受け取るが**使わない**。`event-refs.ts` の `EventRef` は
   * タグから読んだリレー URL を運んでくるが、これはリレーが自由に書ける
   * フィールドであり、信頼できるかどうかをまだ検討していない (仕様 4.2 節)。
   * 引数だけ先に置いているのは、呼び出し側 (`EventView`) がタグから読む処理を
   * どのみち書くため —— 黙って握りつぶすのではなく、ここで意図的に捨てている
   * ことを明示する。
   */
  request(id: string, relayHint?: RelayUrl): void;
  /**
   * `id` を含むバッチが 1 本片付いたのに、まだ `store.get(id)` が
   * `undefined` であること。要求したことが無い id については `false`。
   *
   * `fetchOnce` は全リレーが EOSE/CLOSED を返すかタイムアウトで**必ず**
   * 解決するので、「バッチが片付いた」は判定できる。これが「取得中」と
   * 「取得できなかった」を呼び出し側が区別する唯一の手段である (仕様 7 節)。
   */
  isUnresolved(id: string): boolean;
  /**
   * バッチが 1 本片付く (= `fetchOnce` が解決する) たびに呼ばれる。
   * `profile-requests.ts` の `subscribe` と同じ理由・同じ形 —— どの id が
   * 解決したかは通知しない。呼び出し側 (`EventView`) は自分の id を
   * `store`/`isUnresolved` からもう一度引き直せばよい。
   */
  subscribe(listener: () => void): () => void;
  dispose(): void;
};

export type CreateEventRequestsOptions = {
  store: EventStore;
  manager: SubscriptionManager;
  /**
   * バッチ窓のタイマー注入口 (テスト用)。既定は実タイマー
   * (`connection-pool.ts` の `defaultScheduler` と同じ規約 —— 読み取り層は
   * どこであれ実タイマーを直接掴まない)。
   */
  scheduler?: Scheduler;
};

/**
 * まとめる窓の長さ。`profile-requests.ts` の `PROFILE_BATCH_MS` と同じ
 * 200ms —— 値を変える理由が無い。返信・引用・リポストの対象 id も、
 * プロフィールと同じく「カラムがまとめて描画した数十件の `<EventView>` が、
 * ほぼ同時にだが同じマクロタスクとは限らないタイミングで `request()` を
 * 呼ぶ」対象であり、1 本の REQ にまとめたい理由がそのまま当てはまる。
 */
export const EVENT_BATCH_MS = 200;

/**
 * 関連イベント (返信元・引用先・リポスト対象) 要求のコアレッサ (spec 4 節)。
 *
 * `profile-requests.ts` の `createProfileRequests` と同じ形。違うのは 3 点
 * だけ: フィルタが `{ kinds: [0], authors }` ではなく `{ ids }`、既取得の
 * 判定が `latestReplaceable(0, pubkey)` ではなく `store.get(id)`、そして
 * `isUnresolved` がある (プロフィールには無い —— kind:0 が来ないことは
 * `<Profile>` にとって「まだプロフィールを書いていない人」と区別がつかず、
 * 表示側は空のまま気にしなくてよいが、返信元・引用先・リポスト対象は
 * 「読み込み中」と「もう見つからない (削除・未着) 」を画面上で描き分ける
 * 必要があるため)。
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
   * 要求して、それを含むバッチが片付いた id。`fetchOnce` は全リレーが
   * EOSE/CLOSED を返すかタイムアウトで**必ず**解決するので、ここに入って
   * いて store に無いなら「探したが見つからなかった」と言い切れる。
   * 「まだ探している最中」と区別するための集合であり、これが無いと
   * 遅いだけのものが壊れて見える (仕様 7 節)。
   */
  const settled = new Set<string>();

  /**
   * 窓を閉じて `fetchOnce` を 1 本投げる。`pending` をこの時点で新しい Set に
   * 差し替えるのは、`fetchOnce` が解決する前に新しい `request()` が来た場合
   * (dispose() 後は起きない) に、その分を今回のバッチへ混ぜず**次の**バッチへ
   * 回すため (仕様の「窓が閉じた後の新しい要求は次のバッチになる」)。
   */
  const flush = (): void => {
    timer = null;
    if (pending.size === 0) return;
    const ids = [...pending];
    pending = new Set();

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
