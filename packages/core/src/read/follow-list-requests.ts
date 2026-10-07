import type { RelayFilter, RelayUrl } from "../relay/relay-connection";
import { type Scheduler, defaultScheduler } from "./connection-pool";
import type { EventStore } from "./event-store";
import type { RoutingTable } from "./routing-table";
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

/** 行き先に足す、その人の書き込みリレーの数。一度きりの取得で開く接続を増やしすぎない。 */
const MAX_AUTHOR_RELAYS = 2;

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

/**
 * 一度きりの取得の行き先。その人の書き込みリレーが分かれば先頭の数本、分からなければ
 * `undefined`（いつものリレー）。空配列は「リレー 0 本」になってしまうので返さない。
 */
export const followListRelays = (
  writeRelays: readonly RelayUrl[],
): RelayUrl[] | undefined =>
  writeRelays.length > 0 ? writeRelays.slice(0, MAX_AUTHOR_RELAYS) : undefined;

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
  routing: RoutingTable;
  scheduler?: Scheduler;
};

export const createFollowListRequests = (
  options: CreateFollowListRequestsOptions,
): FollowListRequests => {
  const scheduler = options.scheduler ?? defaultScheduler;
  // 取りにいった時刻。取り終わりではなく始めた時刻を置くので、返事を待つ間の要求も弾ける。
  // 一覧そのものと「自分を指す一覧」は別の問いなので、キーを分ける。
  const checkedAt = new Map<string, number>();
  let disposed = false;

  return {
    request(pubkey, kind) {
      // 公開鍵でない値を著者に入れると、リレーは要求ごと断る。
      if (disposed || !HEX_64.test(pubkey)) return;
      const now = scheduler.now();
      const stored = options.store.latestReplaceable(FOLLOW_KIND, pubkey);

      if (kind.type === "follows-you") {
        // 手元の一覧で答えられる。取り直しは見出し側（list）に任せる。
        if (stored !== undefined) return;
        // 一覧を取ったばかりなら、公開していないことまで含めて答えが出ている。
        if (!isFollowListDue(checkedAt.get(pubkey), now)) return;
      }
      const key = kind.type === "list" ? pubkey : `${pubkey}:${kind.viewer}`;
      if (!isFollowListDue(checkedAt.get(key), now)) return;

      checkedAt.set(key, now);
      const filter = followListFilter(pubkey, stored, kind);
      const relays = followListRelays(options.routing.writeRelaysFor(pubkey));
      void options.manager
        .fetchOnce([filter], relays === undefined ? undefined : { relays })
        .catch(() => {
          // 取れなかったときは、次に開いたときに取り直せるようにしておく。
          checkedAt.delete(key);
        });
    },
    dispose() {
      disposed = true;
      checkedAt.clear();
    },
  };
};
