import type { NostrEvent } from "../nostr/event";
import type { RelayFilter, RelayUrl } from "../relay/relay-connection";
import type { ConnectionPool, PooledSubscription } from "./connection-pool";
import { BOOTSTRAP_INDEXERS } from "./default-relays";
import type { EventStore } from "./event-store";

const FOLLOW_LIST_KIND = 3;
const RELAY_LIST_KIND = 10002;
const DEFAULT_TIMEOUT_MS = 10_000;

export type WarmUpResult = {
  /** フォローリストに載っていた pubkey */
  followees: string[];
  /** kind:10002 が引けた人数 */
  routed: number;
  /** 引けなかった人数 */
  unroutable: number;
};

export type WarmUpOptions = {
  pubkey: string;
  store: EventStore;
  /**
   * 接続と予算の強制は ConnectionPool に一本化されている (ADR-0011, Task 11)。
   * ウォームアップはここを経由せずに自前で connect() することを禁じられている
   * — 予算の外側にもう 1 系統ソケットを持つと、30 接続の上限が数字として
   * 意味を失う。予算が埋まっていてもインデクサが必ず開けるのは、collect() が
   * `pool.subscribe(..., { reserved: true })` を使うから (ConnectionPool の
   * `SubscribeOptions` 参照)。
   */
  pool: ConnectionPool;
  indexers?: readonly RelayUrl[];
  /**
   * ① フォローリスト取得、② kind:10002 一括取得の各フェーズにそれぞれ
   * この上限をフルで与える。2 フェーズとも最悪ケースまでかかると、
   * warmUpRouting() 全体の最悪所要時間はこの値の **2 倍** になる。
   */
  timeoutMs?: number;
};

/**
 * 複数のインデクサへ同じフィルタを投げ、全 URL が片付く (EOSE か CLOSED を
 * 報告する) かタイムアウトするまで待つ。届いたイベントは EventStore に
 * 入れるだけで、呼び出し元へは返さない — 呼び出し元は store 経由で読む。
 *
 * 1 URL につき「片付いた」判定は 1 回だけしか数えない。EOSE の後に CLOSED
 * が届く (あるいはその逆) リレーが実在し、素直にカウントダウンするだけだと
 * 同じ URL で 2 回減算されて、他の URL の応答を待たずに終わってしまう。
 *
 * 片付いた URL はその場で購読を閉じる。全部の片付きを待ってからまとめて
 * 閉じると、先に応答した速いリレーの購読が、遅いリレーのぶんだけ
 * (最悪 timeoutMs いっぱい) 無駄に開いたままになる。タイムアウトで
 * finish() した場合は、まだ片付いていない URL の購読をそこで閉じる。
 *
 * `pool.subscribe()` は `{ reserved: true }` で呼ぶ — インデクサは予算が
 * 埋まっていても必ず開けなければならない (ConnectionPool の
 * `SubscribeOptions` 参照)。1 URL につき開いているエントリはここでは常に
 * 1 個だけなので、片付いた時点でその購読を閉じると同時にプールはその URL の
 * 接続そのものも閉じる (最後のエントリが消えるとプールが接続を落とす仕様) —
 * つまり「片付いたら即座に閉じる」がそのまま「使わなくなった予算をすぐ返す」
 * にもなる。次のフェーズで同じ URL がまた必要なら、そこで新しく繋ぎ直す
 * (WebSocket 再接続のコストと引き換えに、ここで無駄に枠を握り続けない)。
 *
 * `open` は warmUpRouting 側が両フェーズを通して持つ Map で、ここが開いた
 * `PooledSubscription` を記録する — collect() が例外なく正常に終わる限り、
 * この呼び出しが返る時点で空になっている (settle か finish() のどちらかが
 * 必ず閉じるため)。warmUpRouting の `finally` はこれを安全網として使う。
 *
 * ここは Outbox ルーティングを使わない専用経路 (ADR-0016)。
 */
const collect = (
  pool: ConnectionPool,
  urls: readonly RelayUrl[],
  filters: RelayFilter[],
  store: EventStore,
  timeoutMs: number,
  open: Map<RelayUrl, PooledSubscription>,
): Promise<void> =>
  new Promise((resolve) => {
    let pending = urls.length;
    let done = false;
    const settled = new Set<RelayUrl>();

    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      for (const subscription of open.values()) subscription.close();
      open.clear();
      resolve();
    };
    const timer = setTimeout(finish, timeoutMs);

    if (urls.length === 0) {
      finish();
      return;
    }

    const settleOnce = (url: RelayUrl) => {
      if (settled.has(url)) return;
      settled.add(url);
      // ここで閉じておけば finish() 側で二重に閉じても安全
      // (PooledSubscription.close() は冪等)。
      open.get(url)?.close();
      open.delete(url);
      pending -= 1;
      if (pending <= 0) finish();
    };

    for (const url of urls) {
      const subscription = pool.subscribe(
        url,
        filters,
        {
          // 信頼境界: インデクサが要求した filters と無関係な kind/著者の
          // イベントを寄越しても、ここではフィルタと突き合わせて確認しない。
          // store.put() 側の schnorr 署名検証と、
          // EventStore.#indexReplaceable の created_at 最大値ルール
          // (ADR-0016) がある限り、悪意あるインデクサが差し込めるのは
          // 「本人が実際に署名した、かつ最新版ではない」イベントに限られる —
          // ルーティング表を乗っ取ることはできない。影響範囲はこの境界で
          // 抑えられる。
          onEvent: (event: NostrEvent) => {
            store.put(event, url);
          },
          onEose: () => settleOnce(url),
          onClosed: () => settleOnce(url),
        },
        // ブートストラップだけが使ってよい予算迂回 (ConnectionPool の
        // `SubscribeOptions` 参照)。ここ以外では絶対に使わないこと。
        { reserved: true },
      );

      if (!subscription) {
        // `reserved: true` は予算チェックそのものを飛ばすので、
        // pool.subscribe() が undefined を返す唯一の経路 (予算切れ) は
        // ここでは構造的に起こらないはず。それでも `subscribe()` は
        // 「例外を投げない」契約なので、万一に備えてハングせず即座に
        // 片付いたものとして扱う。
        settleOnce(url);
        continue;
      }

      // subscribe() が同期的に onClosed を呼ぶ実装がある (connect() の失敗、
      // あるいは connection.subscribe() 自体の失敗を pool が同期的に
      // handlers.onClosed(...) へ変換する)。その場合 settleOnce はまだ
      // `open` に載っていない url を閉じられず、単一 URL なら finish() も
      // この時点で既に走り切ってしまっている (done=true) ので、もう誰も
      // `open` を見に来ない。ここで拾って即座に閉じ、迷子にしない。
      if (done) subscription.close();
      else open.set(url, subscription);
    }
  });

export const warmUpRouting = async ({
  pubkey,
  store,
  pool,
  indexers = BOOTSTRAP_INDEXERS,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}: WarmUpOptions): Promise<WarmUpResult> => {
  // 両フェーズを通して collect() が使う。正常終了なら collect() 自身が
  // 都度空にするので、finally はあくまで例外時の安全網。
  const open = new Map<RelayUrl, PooledSubscription>();

  try {
    // ① フォローリスト
    await collect(
      pool,
      indexers,
      [{ kinds: [FOLLOW_LIST_KIND], authors: [pubkey], limit: 1 }],
      store,
      timeoutMs,
      open,
    );

    const followList = store.latestReplaceable(FOLLOW_LIST_KIND, pubkey);
    const followees = followList
      ? [
          ...new Set(
            followList.tags
              .filter((tag) => tag[0] === "p" && typeof tag[1] === "string")
              .map((tag) => tag[1]),
          ),
        ]
      : [];

    if (followees.length === 0) {
      return { followees, routed: 0, unroutable: 0 };
    }

    // ② 全員分の kind:10002 を 1 クエリで (ADR-0016)
    await collect(
      pool,
      indexers,
      [{ kinds: [RELAY_LIST_KIND], authors: followees }],
      store,
      timeoutMs,
      open,
    );

    let routed = 0;
    for (const followee of followees) {
      if (store.latestReplaceable(RELAY_LIST_KIND, followee)) routed += 1;
    }

    return { followees, routed, unroutable: followees.length - routed };
  } finally {
    // 正常系では collect() 自身がここまでに `open` を空にしている
    // (Ambiguity 3: release on completion) — ここは例外が collect() の
    // 外へ漏れた場合だけの安全網。
    for (const subscription of open.values()) subscription.close();
    open.clear();
  }
};
