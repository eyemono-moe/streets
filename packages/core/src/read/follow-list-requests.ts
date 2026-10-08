import type { RelayFilter } from "../relay/relay-connection";
import { createBatchedFetch } from "./batched-fetch";
import type { EventStore } from "./event-store";
import { type Scheduler, defaultScheduler } from "./scheduler";
import type { SubscriptionManager } from "./subscription-manager";

const FOLLOW_KIND = 3;
const HEX_64 = /^[0-9a-f]{64}$/;

/**
 * 同じ人のフォロー一覧を取り直す間隔。一覧は 1 件 20KB 超になることがあるので、
 * 画面を開くたびには取らない。手元の版があれば `since` 付きで聞くので、変わって
 * いないときの取り直しは 0 件で済む（置換可能イベントはリレーが最新版しか持たない）。
 * 通信量より、フォロー数の表示が遅れる長さを優先して 10 分にしている。
 */
export const FOLLOW_LIST_RECHECK_MS = 10 * 60 * 1000;

/** 一度きりの取得の行き先の数。 */
const AUTHOR_RELAYS = 2;

export type FollowListRequestKind =
  /** 一覧そのもの。見出しのフォロー数に使う。 */
  | { type: "list" }
  /** 一覧のうち `viewer` を指しているものだけ。手元に一覧が無い人の「フォローされています」用。 */
  | { type: "follows-you"; viewer: string };

/** 取り直す時期か。まだ取っていない、または前回から間隔が過ぎた。 */
export const isFollowListDue = (
  checkedAt: number | undefined,
  now: number,
): boolean =>
  checkedAt === undefined || now - checkedAt >= FOLLOW_LIST_RECHECK_MS;

/**
 * 手元の版から作る問い合わせ。手元に版があれば、それより新しいものだけを聞く。
 * 無ければ `follows-you` は自分を指す一覧だけ、`list` は一覧そのものを聞く
 * （`#p` で絞るのは、フォローしていない人の一覧を運ばないため）。
 */
export const followListFilter = (
  pubkey: string,
  stored: { created_at: number } | undefined,
  kind: FollowListRequestKind,
): RelayFilter => {
  if (stored !== undefined) {
    return {
      kinds: [FOLLOW_KIND],
      authors: [pubkey],
      since: stored.created_at + 1,
      limit: 1,
    };
  }
  return kind.type === "follows-you"
    ? { kinds: [FOLLOW_KIND], authors: [pubkey], "#p": [kind.viewer], limit: 1 }
    : { kinds: [FOLLOW_KIND], authors: [pubkey], limit: 1 };
};

export type FollowListRequests = {
  /**
   * その人のフォロー一覧を、必要なら一度だけ取りにいく。取ってから間隔が過ぎていなければ、
   * 取っている最中なら何もしない。届いた版は store に入る（読む側は store から読む）。
   */
  request(pubkey: string, kind: FollowListRequestKind): void;
  dispose(): void;
};

export type CreateFollowListRequestsOptions = {
  store: EventStore;
  manager: SubscriptionManager;
  scheduler?: Scheduler;
};

export const createFollowListRequests = (
  options: CreateFollowListRequestsOptions,
): FollowListRequests => {
  const scheduler = options.scheduler ?? defaultScheduler;
  // 取りにいった時刻。取り終わりではなく始めた時刻を置くので、返事を待つ間の要求も弾ける。
  // 一覧そのものと「自分を指す一覧」は別の問いなので、キーを分ける。
  const checkedAt = new Map<string, number>();
  const batch = createBatchedFetch<{
    key: string;
    pubkey: string;
    kind: FollowListRequestKind;
  }>({
    manager: options.manager,
    batchWindowMs: "immediate",
    keyOf: (request) => request.key,
    // 行き先も問い合わせも人ごとに違うので束ねず、1 本ずつ取る。
    toRequest: ([{ pubkey, kind }]) => ({
      filters: [
        followListFilter(
          pubkey,
          options.store.latestReplaceable(FOLLOW_KIND, pubkey),
          kind,
        ),
      ],
      relays: options.manager.relaysForAuthor(pubkey, AUTHOR_RELAYS),
    }),
    // 取れなかったときは、次に開いたときに取り直せるようにしておく。
    onFailed: (requests) => {
      for (const { key } of requests) checkedAt.delete(key);
    },
  });

  return {
    request(pubkey, kind) {
      // 公開鍵でない値を著者に入れると、リレーは要求ごと断る。
      if (batch.disposed || !HEX_64.test(pubkey)) return;
      const now = scheduler.now();

      if (kind.type === "follows-you") {
        // 手元の一覧で答えられる。取り直しは見出し側（list）に任せる。
        if (options.store.latestReplaceable(FOLLOW_KIND, pubkey) !== undefined)
          return;
        // 一覧を取ったばかりなら、公開していないことまで含めて答えが出ている。
        if (!isFollowListDue(checkedAt.get(pubkey), now)) return;
      }
      const key = kind.type === "list" ? pubkey : `${pubkey}:${kind.viewer}`;
      if (!isFollowListDue(checkedAt.get(key), now)) return;

      checkedAt.set(key, now);
      batch.enqueue({ key, pubkey, kind });
    },
    dispose() {
      batch.dispose();
      checkedAt.clear();
    },
  };
};
