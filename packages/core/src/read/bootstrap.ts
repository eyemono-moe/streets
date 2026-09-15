import type { RelayUrl } from "../relay/relay-connection";
import { isStale, policyFor } from "./cache-policy";
import { type RelaySettle, collect } from "./collect";
import {
  type ConnectionPool,
  type PooledHold,
  type PooledSubscription,
  type Scheduler,
  defaultScheduler,
} from "./connection-pool";
import { BOOTSTRAP_INDEXERS } from "./default-relays";
import type { EventStore } from "./event-store";

const FOLLOW_LIST_KIND = 3;
const RELAY_LIST_KIND = 10002;
const DEFAULT_TIMEOUT_MS = 10_000;

export type WarmUpResult = {
  followees: string[];
  /** 相ごとに、どの URL が何 ms でどう片付いたか。所要時間は最も遅い 1 本で決まる。 */
  phase1Relays: RelaySettle[];
  phase2Relays: RelaySettle[];
  routed: number;
  unroutable: number;
  /**
   * 要求していないのに送られてきて捨てたイベントの件数。ブートストラップには
   * SubscriptionManager が無いので、ここが唯一の報告先になる。
   */
  unrequested: number;
  /** ① フォローリスト取得 (kind:3) に費やした ms。 */
  phase1Ms: number;
  /** ② 全員分の kind:10002 取得に費やした ms。 */
  phase2Ms: number;
};

export type WarmUpOptions = {
  pubkey: string;
  store: EventStore;
  /**
   * 接続と予算は ConnectionPool に一本化されているので自前で connect() しない。
   * インデクサが予算超過時も必ず開けるのは collect() の `{ reserved: true }`。
   */
  pool: ConnectionPool;
  indexers?: readonly RelayUrl[];
  /**
   * ①②各フェーズにフルで与えるので、両方が最悪ケースだと warmUpRouting()
   * 全体の最悪所要時間はこの値の **2 倍** になる。
   */
  timeoutMs?: number;
  /**
   * 鮮度判定に使う時計。`store` 構築時と**同じインスタンス**を渡すこと ——
   * 別の時計だと `fetchedAt` との差分がかみ合わず、鮮度判定が意味を失う。
   */
  scheduler?: Scheduler;
};

// settle 判定 (全リレーが EOSE/CLOSED かタイムアウトするまで待って EventStore
// へ入れる) は `SubscriptionManager.fetchOnce` と共有するため `./collect` に
// 引き上げてある。`{ reserved: true }` の予算迂回はブートストラップ専用。

export const warmUpRouting = async ({
  pubkey,
  store,
  pool,
  indexers = BOOTSTRAP_INDEXERS,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  scheduler = defaultScheduler,
}: WarmUpOptions): Promise<WarmUpResult> => {
  // 両フェーズで共有する購読集合。collect() が正常終了時に都度空にするので、
  // finally はあくまで例外時の安全網。
  const open = new Map<RelayUrl, PooledSubscription>();
  // インデクサごとに 1 個だけ持つ「アンカー」の hold。collect() は 1 URL に
  // つき 1 エントリしか持たないため、無いとフェーズ①の settle で接続が落ち
  // フェーズ②で繋ぎ直しになる。REQ ではなく `pool.hold()` を使うのは、一部
  // のリレーが filters に kind 必須のエラーで CLOSE してしまうため。
  const anchors = new Map<RelayUrl, PooledHold>();

  try {
    for (const url of indexers) {
      const anchor = pool.hold(
        url,
        // ブートストラップ専用の予算迂回 (`SubscribeOptions` 参照)。他では使わない。
        { reserved: true },
      );
      if (anchor) anchors.set(url, anchor);
    }

    // ① フォローリスト。表示専用の内訳計測なので、event-store.ts の
    // verifyMs と同じ理由で performance.now() を直に呼ぶ (`Scheduler` は
    // 分岐を決定的に進めるためのもので、時刻取得一般は禁じていない)。
    const phase1Relays: RelaySettle[] = [];
    const phase2Relays: RelaySettle[] = [];
    const phase1StartedAt = performance.now();
    const unrequestedFollows = await collect(
      pool,
      indexers,
      [{ kinds: [FOLLOW_LIST_KIND], authors: [pubkey], limit: 1 }],
      store,
      timeoutMs,
      open,
      // ブートストラップ専用の予算迂回 (`CollectOptions` 参照)。他では使わない。
      {
        reserved: true,
        onRelaySettled: (settle) => phase1Relays.push(settle),
      },
    );
    const phase1Ms = performance.now() - phase1StartedAt;

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

    // ② 全員分の kind:10002 を 1 クエリで。自分は followees に入るとは
    // 限らない (p タグで自分をフォローするのは稀) ので明示的に自分の pubkey
    // を足す (足さないと write リレーが分からず publish できない)。
    // relayListAuthors は pubkey を含むため空にならず、フェーズは必ず走る。
    const relayListAuthors = [...new Set([pubkey, ...followees])];

    // 既に新鮮な kind:10002 を持つ著者まで取り直すと、フェッチを間引く効果が
    // 消える。`fetchedAt` が undefined (未取得) の著者は isStale を呼ぶまでもなく対象。
    const relayListPolicy = policyFor(RELAY_LIST_KIND);
    const now = scheduler.now();
    const staleRelayListAuthors = relayListAuthors.filter((author) => {
      const fetchedAt = store.replaceableFetchedAt(RELAY_LIST_KIND, author);
      return (
        fetchedAt === undefined || isStale(relayListPolicy, fetchedAt, now)
      );
    });

    let unrequestedRelayLists = 0;
    let phase2Ms = 0;
    // 全員新鮮なら REQ を出す理由が無い —— 空の authors だと無意味な REQ になる。
    if (staleRelayListAuthors.length > 0) {
      const phase2StartedAt = performance.now();
      unrequestedRelayLists = await collect(
        pool,
        indexers,
        [{ kinds: [RELAY_LIST_KIND], authors: staleRelayListAuthors }],
        store,
        timeoutMs,
        open,
        // ブートストラップ専用の予算迂回 (`CollectOptions` 参照)。他では使わない。
        {
          reserved: true,
          onRelaySettled: (settle) => phase2Relays.push(settle),
        },
      );
      phase2Ms = performance.now() - phase2StartedAt;
    }

    let routed = 0;
    for (const followee of followees) {
      if (store.latestReplaceable(RELAY_LIST_KIND, followee)) routed += 1;
    }

    return {
      followees,
      routed,
      unroutable: followees.length - routed,
      unrequested: unrequestedFollows + unrequestedRelayLists,
      phase1Ms,
      phase2Ms,
      phase1Relays,
      phase2Relays,
    };
  } finally {
    // collect() が正常終了時に空にしているはずなので、例外時の安全網。
    for (const subscription of open.values()) subscription.close();
    open.clear();
    // 両フェーズ (または例外による早期離脱) が終わって初めて release する。
    // これで holds もエントリも 0 になり、プールが接続を落として予算を返す。
    for (const anchor of anchors.values()) anchor.release();
    anchors.clear();
  }
};
