import type {
  RelaySubscriptionHandlers,
  RelayUrl,
} from "../relay/relay-connection";
import { collect } from "./collect";
import type { ConnectionPool, PooledSubscription } from "./connection-pool";
import { BOOTSTRAP_INDEXERS } from "./default-relays";
import type { EventStore } from "./event-store";

const FOLLOW_LIST_KIND = 3;
const RELAY_LIST_KIND = 10002;
const DEFAULT_TIMEOUT_MS = 10_000;
/**
 * 実在しない id。アンカー購読 (下記 `warmUpRouting` 内) が過去にも未来にも
 * 絶対にマッチしないようにするためだけの値 — アンカーはデータを集める役目を
 * 持たない (それは `collect()` の仕事)。
 */
const NEVER_MATCHING_ID = "0".repeat(64);
/**
 * アンカー購読のハンドラを作る。何も読み取らない —— ただしフィルタが
 * `{ids:[NEVER_MATCHING_ID]}` である以上、この subId へ届く `EVENT` は構造上
 * 必ず要求していないもの (信頼境界、ADR-0023) なので、`onCount` でその件数を
 * 呼び出し元の `unrequested` 集計へ足す。呼び出しごとに閉じた `onCount` を
 * 受け取る関数にしているのは、モジュール直下の定数のままだと
 * `warmUpRouting()` の呼び出し間で状態を共有できず (テストの複数呼び出しが
 * 互いの件数を汚染する)、この呼び出し 1 回ぶんの `WarmUpResult.unrequested`
 * に正しく積めないため。
 */
const createAnchorHandlers = (
  onCount: () => void,
): RelaySubscriptionHandlers => ({
  onEvent: () => onCount(),
  onEose: () => {},
  onClosed: () => {},
});

export type WarmUpResult = {
  /** フォローリストに載っていた pubkey */
  followees: string[];
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
}: WarmUpOptions): Promise<WarmUpResult> => {
  // 両フェーズを通して collect() が使う。正常終了なら collect() 自身が
  // 都度空にするので、finally はあくまで例外時の安全網。
  const open = new Map<RelayUrl, PooledSubscription>();
  // インデクサ 1 本につき、この warmUpRouting() 呼び出し全体を通して 1 個だけ
  // 開く「アンカー」購読 (fix round 1, Important 1)。
  //
  // collect() は 1 URL につき 1 エントリしか持たない。アンカーが無いと、
  // フェーズ① の購読が settle して閉じた瞬間にその URL のエントリ数が 0 に
  // なり、プールが接続そのものを落とす (#drop) — フェーズ② が同じ URL を
  // また必要とする時には、繋ぎ直すほかない。このアンカーがもう 1 エントリを
  // 通しで持つことで、フェーズ①→② の間にエントリ数が 0 を経由しないように
  // し、同じ接続をフェーズ② でも再利用する (subscription-manager.ts の
  // #applyEntryDiff が同一 URL の filters 差し替えで使っている「新しい方を
  // 先に開いてから古い方を閉じる」のと同じ考え方を、ここでは 1 回の diff
  // ではなく呼び出し全体のスコープに引き上げて適用している)。
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
  // アンカーの filters は「絶対にマッチしない」ことだけが要件 — 実データを
  // 集める役目は持たない (それは collect() 側の仕事)。
  const anchors = new Map<RelayUrl, PooledSubscription>();
  // アンカー宛に届いた (構造上、必ず要求していない) イベントの件数。
  // collect() の unrequested とは別集計で、最後に合算して返す。
  let anchorUnrequested = 0;

  try {
    for (const url of indexers) {
      const anchor = pool.subscribe(
        url,
        [{ ids: [NEVER_MATCHING_ID] }],
        createAnchorHandlers(() => {
          anchorUnrequested += 1;
        }),
        // ブートストラップだけが使ってよい予算迂回 (ConnectionPool の
        // `SubscribeOptions` 参照)。ここ以外では絶対に使わないこと。
        { reserved: true },
      );
      if (anchor) anchors.set(url, anchor);
    }

    // ① フォローリスト
    const unrequestedFollows = await collect(
      pool,
      indexers,
      [{ kinds: [FOLLOW_LIST_KIND], authors: [pubkey], limit: 1 }],
      store,
      timeoutMs,
      open,
      // ブートストラップだけが使ってよい予算迂回 (`./collect` の
      // `CollectOptions` 参照)。ここ以外では絶対に使わないこと。
      { reserved: true },
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

    const unrequestedRelayLists = await collect(
      pool,
      indexers,
      [{ kinds: [RELAY_LIST_KIND], authors: relayListAuthors }],
      store,
      timeoutMs,
      open,
      // ブートストラップだけが使ってよい予算迂回 (`./collect` の
      // `CollectOptions` 参照)。ここ以外では絶対に使わないこと。
      { reserved: true },
    );

    let routed = 0;
    for (const followee of followees) {
      if (store.latestReplaceable(RELAY_LIST_KIND, followee)) routed += 1;
    }

    return {
      followees,
      routed,
      unroutable: followees.length - routed,
      unrequested:
        unrequestedFollows + unrequestedRelayLists + anchorUnrequested,
    };
  } finally {
    // 正常系では collect() 自身がここまでに `open` を空にしている
    // (Ambiguity 3: release on completion) — ここは例外が collect() の
    // 外へ漏れた場合だけの安全網。
    for (const subscription of open.values()) subscription.close();
    open.clear();
    // アンカーはここで初めて閉じる — 両フェーズ (あるいは例外による早期
    // 離脱) が終わったので、ようやくこの URL のエントリを手放してよい。
    // これで各インデクサのエントリ数が 0 になり、プールが接続を落として
    // 予算を返す (Ambiguity 3: release on completion はここで完結する)。
    for (const anchor of anchors.values()) anchor.close();
    anchors.clear();
  }
};
