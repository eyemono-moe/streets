import type { NostrEvent } from "../nostr/event";
import type {
  RelayFilter,
  RelaySubscriptionHandlers,
  RelayUrl,
} from "../relay/relay-connection";
import type { ConnectionPool, PooledSubscription } from "./connection-pool";
import { BOOTSTRAP_INDEXERS } from "./default-relays";
import type { EventStore } from "./event-store";
import { matchesAnyFilter } from "./filter-match";

const FOLLOW_LIST_KIND = 3;
const RELAY_LIST_KIND = 10002;
const DEFAULT_TIMEOUT_MS = 10_000;
/**
 * 実在しない id。アンカー購読 (下記 `warmUpRouting` 内) が過去にも未来にも
 * 絶対にマッチしないようにするためだけの値 — アンカーはデータを集める役目を
 * 持たない (それは `collect()` の仕事)。
 */
const NEVER_MATCHING_ID = "0".repeat(64);
/** アンカー購読のハンドラ。何も読み取らない。 */
const ANCHOR_HANDLERS: RelaySubscriptionHandlers = {
  onEvent: () => {},
  onEose: () => {},
  onClosed: () => {},
};

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
 * `SubscribeOptions` 参照)。ここで開くエントリを閉じても、
 * `warmUpRouting()` が別途持っているアンカー購読 (下記参照) がまだ同じ URL
 * のエントリを握っているので、プールの接続そのものは落ちない —
 * 「settle したらすぐ閉じる」(このコメントの上の段落) は文字どおり
 * このエントリだけの話で、接続の生死には関与しない。
 *
 * `open` は warmUpRouting 側が両フェーズを通して持つ Map で、ここが開いた
 * `PooledSubscription` を記録する — collect() が例外なく正常に終わる限り、
 * この呼び出しが返る時点で空になっている (settle か finish() のどちらかが
 * 必ず閉じるため)。warmUpRouting の `finally` はこれを安全網として使う。
 *
 * ここは Outbox ルーティングを使わない専用経路 (ADR-0016)。
 *
 * 戻り値は「要求していないのに送られてきて捨てたイベントの件数」。全 URL の
 * settle で終わろうとタイムアウトで finish() が発火しようと、この時点までに
 * カウントした `unrequested` をそのまま返す — finish() は単一の resolve 経路
 * であり、どちらの終わり方でも数え漏れ・数え過ぎは起きない。
 */
const collect = (
  pool: ConnectionPool,
  urls: readonly RelayUrl[],
  filters: RelayFilter[],
  store: EventStore,
  timeoutMs: number,
  open: Map<RelayUrl, PooledSubscription>,
): Promise<number> =>
  new Promise((resolve) => {
    let unrequested = 0;
    let pending = urls.length;
    let done = false;
    const settled = new Set<RelayUrl>();

    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      for (const subscription of open.values()) subscription.close();
      open.clear();
      resolve(unrequested);
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
          // 信頼境界 (ADR-0023)。インデクサが要求と無関係な kind/著者を
          // 寄越しても、ここで落とす。ルーティング表の元データが入る経路
          // なので、混入を許すと ADR-0016 の導出そのものが汚れる。
          onEvent: (event: NostrEvent) => {
            if (!matchesAnyFilter(event, filters)) {
              unrequested += 1;
              return;
            }
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

  try {
    for (const url of indexers) {
      const anchor = pool.subscribe(
        url,
        [{ ids: [NEVER_MATCHING_ID] }],
        ANCHOR_HANDLERS,
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
      return {
        followees,
        routed: 0,
        unroutable: 0,
        unrequested: unrequestedFollows,
      };
    }

    // ② 全員分の kind:10002 を 1 クエリで (ADR-0016)
    const unrequestedRelayLists = await collect(
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

    return {
      followees,
      routed,
      unroutable: followees.length - routed,
      unrequested: unrequestedFollows + unrequestedRelayLists,
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
