import type { ColumnDef, ColumnSource } from "@streets/core/deck/deck";

export type ColumnMeta = { icon: string; subtitle: string };

const hashtagOf = (source: ColumnSource): string | undefined => {
  if (source.kind !== "literal") return undefined;
  const tags = source.filters.flatMap((filter) => filter["#t"] ?? []);
  return tags[0];
};

/**
 * ヘッダーのアイコンと説明。デッキが保存するのは「意図」だけなので、
 * 見せ方はここで決める。
 */
export const columnMeta = (column: ColumnDef): ColumnMeta => {
  const source = column.source;
  switch (source.kind) {
    case "followees":
      return {
        icon: "i-material-symbols:home-outline-rounded",
        subtitle: "フォロー中",
      };
    case "bookmarks":
      return {
        icon: "i-material-symbols:bookmark-outline-rounded",
        subtitle: "保存したノート",
      };
    case "notifications":
      return {
        icon: "i-material-symbols:notifications-outline-rounded",
        subtitle: "自分宛の返信・リアクション・リポスト",
      };
    case "user":
      return {
        icon: "i-material-symbols:person-outline-rounded",
        subtitle: "ノートと返信",
      };
    case "followees-list":
      return {
        icon: "i-material-symbols:person-outline-rounded",
        subtitle: "フォロー中の人",
      };
    case "followers-list":
      return {
        icon: "i-material-symbols:person-outline-rounded",
        subtitle: "フォロワー",
      };
    default: {
      const hashtag = hashtagOf(source);
      if (hashtag) {
        return {
          icon: "i-material-symbols:tag-rounded",
          subtitle: "ハッシュタグ",
        };
      }
      return source.relays
        ? {
            icon: "i-material-symbols:globe",
            subtitle: "指定したリレーの全体",
          }
        : {
            icon: "i-material-symbols:pin-drop-outline-rounded",
            subtitle: "指定した条件",
          };
    }
  }
};
