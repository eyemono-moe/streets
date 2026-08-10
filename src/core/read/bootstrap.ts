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
  /** フォローリストに載っていた pubkey */
  followees: string[];
  /** 相ごとに、どの URL が何 ms でどう片付いたか。所要時間は最も遅い 1 本で決まる。 */
  phase1Relays: RelaySettle[];
  phase2Relays: RelaySettle[];
  /** kind:10002 が引けた人数 */
  routed: number;
  /** 引けなかった人数 */
  unroutable: number;
  /**
   * 要求していないのにインデクサが送ってきて捨てたイベントの件数 (仕様 5.3)。
   * ブートストラップには SubscriptionManager が無いので、ここが唯一の
   * 報告先になる。
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
  /**
   * 相②の鮮度判定 (`isStale`) に使う「今」の取得元。`store` を構築した際に
   * 渡したものと**同じインスタンス**を渡すこと —— 別の時計だと
   * `fetchedAt` との差分がかみ合わず、鮮度判定が意味を失う。
   */
  scheduler?: Scheduler;
};

// 全リレーが EOSE/CLOSED を報告するかタイムアウトするまで待ち、届いた
// イベントを EventStore へ入れる、という settle 判定そのものは
// `SubscriptionManager.fetchOnce` (Task 4) と共有する — 両者とも
// `ConnectionPool` と `EventStore` だけを見ればよく、互いには依存しないため、
// `./collect` へ引き上げてある。`{ reserved: true }` は下の呼び出しが
// 明示的に指定する — この迂回はブートストラップだけが使ってよい
// (`ConnectionPool` の `SubscribeOptions` 参照)。定義とコメントは
// `./collect` を参照。

export const warmUpRouting = async ({
  pubkey,
  store,
  pool,
  indexers = BOOTSTRAP_INDEXERS,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  scheduler = defaultScheduler,
}: WarmUpOptions): Promise<WarmUpResult> => {
  // 両フェーズを通して collect() が使う。正常終了なら collect() 自身が
  // 都度空にするので、finally はあくまで例外時の安全網。
  const open = new Map<RelayUrl, PooledSubscription>();
  // インデクサ 1 本につき、この warmUpRouting() 呼び出し全体を通して 1 個だけ
  // 取る「アンカー」の hold (fix round 1, Important 1; Task 3 で
  // `pool.subscribe()` から `pool.hold()` に載せ替え)。
  //
  // collect() は 1 URL につき 1 エントリしか持たない。アンカーが無いと、
  // フェーズ① の購読が settle して閉じた瞬間にその URL のエントリ数が 0 に
  // なり、プールが接続そのものを落とす (#drop) — フェーズ② が同じ URL を
  // また必要とする時には、繋ぎ直すほかない。このアンカーが hold を 1 つ
  // 通しで持つことで、フェーズ①→② の間にエントリ数と hold 数の両方が 0 を
  // 経由しないようにし、同じ接続をフェーズ② でも再利用する
  // (subscription-manager.ts の #applyEntryDiff が同一 URL の filters
  // 差し替えで使っている「新しい方を先に開いてから古い方を閉じる」のと同じ
  // 考え方を、ここでは 1 回の diff ではなく呼び出し全体のスコープに引き
  // 上げて適用している)。
  //
  // 最初のレビューではここを「フェーズごとに繋ぎ直しても実害はない」として
  // 見送っていたが、その根拠にしていた実測 (indexer.coracle.social のレート
  // 制限データ) は BOOTSTRAP_INDEXERS のどれでもない別リレーの計測だったと
  // 判明した。訂正後の理由はもっと単純: 節約できる予算はこの呼び出し 1 回の
  // 中で数十ms 後には自己完結して戻ってくるだけなのに対し、再接続はフォール
  // バックの無いブートストラップ経路で実測されていないコストを払うことになる
  // — ADR-0021 がジッタ付きバックオフを入れている理由も「自ら誘発する再接続
  // バーストは避ける」なので、ここでも同じ判断を踏襲する。
  //
  // かつては「絶対にマッチしない」フィルタ (`{ ids: [NEVER_MATCHING_ID] }`)
  // の REQ でこの保持を表現していたが、実地観測 (2026-08-05) で一部のリレー
  // がそれを `blocked: filters must specify at least one kind` で CLOSE する
  // ことが分かった — 接続の寿命という要求を購読として表現したのが誤りで、
  // 狙った保持効果がそもそも得られていなかった。`pool.hold()`
  // (`connection-pool.ts` 参照) はワイヤに何も出さずに接続の寿命だけを握る
  // 一級の能力で、これに載せ替えたことで「アンカー宛に届く、要求していない
  // イベント」という概念自体が消えた (REQ を出さない以上、そこへ何かが
  // 届くことは構造上ありえない)。
  const anchors = new Map<RelayUrl, PooledHold>();

  try {
    for (const url of indexers) {
      const anchor = pool.hold(
        url,
        // ブートストラップだけが使ってよい予算迂回 (ConnectionPool の
        // `SubscribeOptions` 参照)。ここ以外では絶対に使わないこと。
        { reserved: true },
      );
      if (anchor) anchors.set(url, anchor);
    }

    // ① フォローリスト
    //
    // 表示専用の内訳計測 (仕様 11 節)。どの分岐にも影響しないので、
    // event-store.ts の verifyMs と同じ理由で performance.now() を直に呼ぶ
    // (`Scheduler` はテストが分岐のタイミングを決定的に進めるためのもので、
    // 時刻取得そのものを禁じてはいない)。
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
      // ブートストラップだけが使ってよい予算迂回 (`./collect` の
      // `CollectOptions` 参照)。ここ以外では絶対に使わないこと。
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

    // ② 全員分の kind:10002 を 1 クエリで (ADR-0016)。
    //
    // 自分は followees に入っているとは限らない (自分自身を p タグでフォロー
    // するのは稀) —— にもかかわらず authors を followees だけにすると、
    // 自分の write リレーが一生分からず、publish 先が決まらない
    // (`publisher.ts` が `routing.writeRelaysFor(viewer)` を空としか
    // 引けなくなる)。なので明示的に自分の pubkey を足す (重複排除)。
    //
    // followees が空 (誰もフォローしていない) でもこのフェーズ自体は必ず
    // 走らせる —— relayListAuthors は pubkey を含む以上、空になることは
    // 無い。旧実装はここで `followees.length === 0` を早期 return してこの
    // フェーズごと飛ばしていたが、それだと「誰もフォローしていない新規
    // アカウント」が自分の write リレーを一生取得できなかった。
    const relayListAuthors = [...new Set([pubkey, ...followees])];

    // ポリシー (spec 5 節) を通す — 既に新鮮な kind:10002 を持つ著者まで
    // 毎回取り直すと、このスライスの効果 (相②のフェッチを間引く) が消える。
    // `store.replaceableFetchedAt` が undefined (未取得) の著者は
    // isStale を呼ぶまでもなく取得対象。
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
    // 全員新鮮なら REQ を出す理由が無い —— 空の authors で collect() を
    // 呼ぶと、意味の無い REQ をワイヤへ出してしまう。
    if (staleRelayListAuthors.length > 0) {
      const phase2StartedAt = performance.now();
      unrequestedRelayLists = await collect(
        pool,
        indexers,
        [{ kinds: [RELAY_LIST_KIND], authors: staleRelayListAuthors }],
        store,
        timeoutMs,
        open,
        // ブートストラップだけが使ってよい予算迂回 (`./collect` の
        // `CollectOptions` 参照)。ここ以外では絶対に使わないこと。
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
    // 正常系では collect() 自身がここまでに `open` を空にしている
    // (Ambiguity 3: release on completion) — ここは例外が collect() の
    // 外へ漏れた場合だけの安全網。
    for (const subscription of open.values()) subscription.close();
    open.clear();
    // アンカーはここで初めて release する — 両フェーズ (あるいは例外による
    // 早期離脱) が終わったので、ようやくこの URL の hold を手放してよい。
    // これで各インデクサの holds が 0 になり (エントリも既に 0)、プールが
    // 接続を落として予算を返す (Ambiguity 3: release on completion は
    // ここで完結する)。
    for (const anchor of anchors.values()) anchor.release();
    anchors.clear();
  }
};
