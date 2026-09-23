import { FALLBACK_RELAYS } from "../read/default-relays";
import type { NostrSource } from "../read/source";
import type { RelayUrl } from "../relay/relay-connection";
import { parseSearchQuery, searchFilter } from "../search/query";
import type { RelayListState } from "../settings/relay-list-state";
import { type ColumnSource, NOTIFICATION_KINDS, TIMELINE_KINDS } from "./deck";

/**
 * `followees` を遅延アクセサにするのは、即時評価すると settle のたびに
 * 全カラムが再購読されるため。`followees` 分岐内でだけ呼び、評価時だけ依存させる。
 */
export type ResolveContext = {
  followees: () => readonly string[];
  /**
   * 現在の閲覧者 (`notifications` の `#p` になる)。`followees` と違い
   * ログイン中は固定値なので、遅延アクセサにせずどの分岐で読んでもよい。
   */
  viewer: string;
  /**
   * 閲覧者の NIP-65 リレーリスト。`followees` と同じ理由で遅延アクセサ。
   * 取得中は fallback へ一瞬購読せず 0 本で待つため、状態ごと渡す。
   */
  relayList: () => RelayListState;
  /**
   * 閲覧者がブックマークしたノートの id。`followees` と同じ理由で遅延アクセサ。
   * kind:10003 が届くたびに変わるので、デッキへは焼き込まない。
   */
  bookmarks: () => readonly string[];
  /**
   * 検索を投げる先（kind:10007 か既定）。`followees` と同じ理由で遅延アクセサ。
   */
  searchRelays: () => readonly RelayUrl[];
};

/**
 * デッキが保存する「意図」を読み取り層の「クエリ」へ変える唯一の場所 ——
 * フォローリストのような変わる値をデッキへ焼き込むと更新が反映されなくなる。
 */
export const resolveSource = (
  source: ColumnSource,
  context: ResolveContext,
): NostrSource => {
  if (source.kind === "followees") {
    // フォロー 0 人でも `authors` を落とさない —— `{ kinds: [1] }` は
    // NIP-01 では「誰の投稿でもよい」であり、本物のリレーへの無制限購読に
    // なる。空配列は「該当者なし」であって「無制限」ではない。
    return {
      type: "nostr",
      filters: [{ kinds: source.kinds, authors: [...context.followees()] }],
    };
  }

  if (source.kind === "search") {
    // 著者を指定しない問い合わせなので Outbox で行き先を決められない。
    // 検索に答えるリレー（設定か既定）へ明示的に送る。
    return {
      type: "nostr",
      filters: [searchFilter(parseSearchQuery(source.query))],
      relays: [...context.searchRelays()],
    };
  }

  if (source.kind === "notifications") {
    // `#p` フィルタには `authors` が無いので Outbox でルーティングできない
    // (`query-plan.ts`: 著者を指定していないフィルタは fallback へ同報)。
    // NIP-65 は publish 側に「`#p` で指した相手の read リレーへも送る」を
    // SHOULD で求めているので、待ち受けるべきはそこ。
    const relayList = context.relayList();
    const readRelays =
      relayList.phase === "ready"
        ? relayList.entries
            .filter((entry) => entry.read)
            .map((entry) => entry.url)
        : [];
    return {
      type: "nostr",
      filters: [{ kinds: [...NOTIFICATION_KINDS], "#p": [context.viewer] }],
      // loading 中の空配列だけは意図的な「0 本の明示指定」。fallback へ
      // 一瞬購読してから本来の read リレーへ張り直すことを防ぐ。
      // settle 後の空リストは永久に 0 本で待たず fallback へ落とす。
      relays:
        relayList.phase === "signed-out" || relayList.phase === "loading"
          ? []
          : readRelays.length > 0
            ? readRelays
            : [...FALLBACK_RELAYS],
    };
  }

  if (source.kind === "bookmarks") {
    // 空配列は「該当なし」。`ids` ごと落とすと無制限購読になる。
    return { type: "nostr", filters: [{ ids: [...context.bookmarks()] }] };
  }

  if (source.kind === "thread") {
    // スレッドの購読先は根から決まり、根は store を見ないと分からない
    // （`createThreadSource` が持つ）。ここでは何も購読しない。
    return { type: "nostr", filters: [] };
  }

  if (source.kind === "activity") {
    return {
      type: "nostr",
      filters: [
        { kinds: [6, 7, 16], "#e": [source.target] },
        { kinds: [1], "#q": [source.target] },
      ],
    };
  }

  if (source.kind === "user") {
    return {
      type: "nostr",
      filters: [{ kinds: [...TIMELINE_KINDS], authors: [source.pubkey] }],
    };
  }

  if (source.kind === "followees-list") {
    return {
      type: "nostr",
      filters: [{ kinds: [3], authors: [source.pubkey], limit: 1 }],
    };
  }

  if (source.kind === "followers-list") {
    return {
      type: "nostr",
      filters: [{ kinds: [3], "#p": [source.pubkey] }],
    };
  }

  // `relays` は指定があるときだけ載せる。`relays: undefined` というキーを
  // 生やすと、明示リレーかどうかを `!== undefined` で見ている側から
  // 「リレー 0 本の明示指定」に見える。
  return source.relays
    ? { type: "nostr", filters: source.filters, relays: source.relays }
    : { type: "nostr", filters: source.filters };
};
