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
   * バッチが 1 本片付く (= `fetchOnce` が解決する) たびに呼ばれる。
   * どの pubkey が解決したかは通知しない —— 呼び出し側 (`<Profile>`) は
   * 自分の pubkey を `store` からもう一度引き直せばよく、無関係なバッチの
   * 完了で余計な再描画をしても実害は小さい (store の参照を 1 回引くだけ)。
   * `ProfileRequests` の型自体は spec の task-5-brief に示されたもの
   * (`request` / `dispose` のみ) を最小限としているが、`<Profile>` が
   * ポーリングも実タイマーも持たずに到着を知る手段が要るため、
   * `SectionReader.subscribe` と同じ「変化を推す」形をここにも足した。
   */
  subscribe(listener: () => void): () => void;
  /**
   * 直近に送ったバッチの `authors` 件数と、観測史上の最大。
   *
   * 1 バッチは 1 本のフィルタに全件を詰めるので、この数がそのまま REQ の
   * メッセージ長になる。NIP-11 の `limitation.max_message_length` を超えると
   * リレーはメッセージごと拒否し、そのバッチのプロフィールが 1 つも届か
   * ない —— 画面には短縮 pubkey が並ぶだけで、原因はどこにも出ない。
   */
  readonly lastBatchSize: number;
  readonly maxBatchSize: number;
  dispose(): void;
};

export type CreateProfileRequestsOptions = {
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
 * まとめる窓の長さ。
 *
 * `section-reader.ts` の `NOTIFY_BATCH_MS` (16ms) とは目的が違うのであえて
 * 値を揃えない —— あちらは「同じマクロタスクに来た複数のリレーメッセージを
 * 1 回の描画通知に畳む」ためのフレーム単位の窓で、16ms より長くする理由が
 * 無い (畳むこと自体は 1 マクロタスク待てば十分で、それ以上待っても新しい
 * イベントが増えるだけで畳む効果は変わらない)。
 *
 * こちらは「1 カラムがまとめて描画した数十件の `<Profile>` が、ほぼ同時に
 * だが同じマクロタスクとは限らないタイミングで `request()` を呼ぶ」のを
 * 1 本の REQ にまとめるための窓であり、対象は `SectionReader` の通知バッチ
 * (16ms 刻み) をまたいで複数回発生しうる。初期表示だけでなく、リレーから
 * 新しいノートが数百ms かけて次々届く間にも新しい著者が増え続ける —— 短すぎる
 * 窓 (例えば 16ms) だと、そのたびに窓を閉じては次の 1 件のためにまた開き
 * 直し、結局イベント数に近い REQ 本数に逆戻りしてしまう。かといって長すぎる
 * と「名前が出るまで」の体感が遅れる。数百 ms のオーダーでバーストの大半を
 * 拾いつつ体感を壊さない値として 200ms を選ぶ。
 */
const PROFILE_BATCH_MS = 200;

/**
 * プロフィール要求のコアレッサ (spec 4 節)。
 *
 * `<Profile pubkey={x} />` はマウントのたびに 1 件ずつ `request(x)` を呼ぶ
 * —— カラム単位で著者集合を導出して購読する設計は採らない (spec 4 節が
 * 撤回として記録している当初案。`items` が変わるたびに派生集合の識別子が
 * 変わり、購読を張り直すため)。イベント単位の宣言をここでまとめることで、
 * ADR-0017 (宣言的レンダラ登録機構) の前身として、波状解決をプロフィール
 * 1 種類に限って先取りする。
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
   * 窓を閉じて `fetchOnce` を 1 本投げる。`pending` をこの時点で新しい Set に
   * 差し替えるのは、`fetchOnce` が解決する前に新しい `request()` が来た場合
   * (dispose() 後は起きない) に、その分を今回のバッチへ混ぜず**次の**バッチへ
   * 回すため (仕様の「窓が閉じた後の新しい要求は次のバッチになる」)。
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
      // 既に EventStore にあり、かつポリシー上まだ新鮮なら要求しない。
      // `fetchedAt` が無い (未取得) 場合は isStale を呼ぶまでもなく要求する。
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
