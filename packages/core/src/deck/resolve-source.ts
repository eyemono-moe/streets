import { FALLBACK_RELAYS } from "../read/default-relays";
import type { NostrSource } from "../read/source";
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
