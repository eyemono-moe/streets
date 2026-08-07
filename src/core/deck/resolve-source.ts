import type { NostrSource } from "../read/source";
import type { ColumnSource } from "./deck";

export type ResolveContext = { followees: readonly string[] };

/**
 * デッキが保存している「意図」(`ColumnSource`) を、読み取り層が理解する
 * 「クエリ」(`NostrSource`) へ変える唯一の場所。
 *
 * 分けている理由は、フォローリストのような**変わる値をデッキに焼き込まない**
 * ため。焼き込むと、誰かをフォローしてもホーム列はデッキを作り直すまで
 * 永久に反映されない (2026-08-06 時点の実装がまさにそうだった)。
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
      filters: [{ kinds: source.kinds, authors: [...context.followees] }],
    };
  }

  // `relays` は指定があるときだけ載せる。`relays: undefined` というキーを
  // 生やすと、明示リレーかどうかを `!== undefined` で見ている側から
  // 「リレー 0 本の明示指定」に見える。
  return source.relays
    ? { type: "nostr", filters: source.filters, relays: source.relays }
    : { type: "nostr", filters: source.filters };
};
