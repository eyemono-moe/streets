import type { ColumnDef } from "./deck";

/**
 * カラムの題名。中身から決める —— 足したときの文字（ユーザーのカラムなら npub の
 * 短縮形）を保存して出すと、名前が分かったあとも npub のまま残る。人に紐づく
 * カラムは、名前を読み取ってから出す（`person` の部分を名前に置き換える）。
 */
export type ColumnTitle = { text: string } | { person: string; suffix: string };

export const columnTitle = (column: ColumnDef): ColumnTitle => {
  const source = column.source;
  switch (source.kind) {
    case "followees":
      return { text: "ホーム" };
    case "notifications":
      return { text: "通知" };
    case "bookmarks":
      return { text: "ブックマーク" };
    case "thread":
      return { text: "スレッド" };
    case "activity":
      return { text: "アクティビティ" };
    case "user":
      return { person: source.pubkey, suffix: "" };
    case "followees-list":
      return { person: source.pubkey, suffix: " のフォロー" };
    case "followers-list":
      return { person: source.pubkey, suffix: " のフォロワー" };
    case "search":
      return { text: source.query };
    case "literal": {
      const tags = source.filters.flatMap((filter) => filter["#t"] ?? []);
      if (tags.length > 0)
        return { text: tags.map((tag) => `#${tag}`).join(" ") };
      const search = source.filters.find((filter) => filter.search)?.search;
      if (search) return { text: search };
      const onlyKinds = source.filters.every((filter) =>
        Object.keys(filter).every((key) => key === "kinds"),
      );
      if (onlyKinds && source.relays && source.relays.length > 0) {
        return {
          text:
            source.relays.length === 1
              ? source.relays[0].replace(/\/$/, "")
              : `リレー（${source.relays.length}）`,
        };
      }
      // 条件を直に書いたカラム（「自分の投稿」など）は、中身から名前を決められない。
      // 足したときの題名を使う。
      return { text: column.title };
    }
  }
};
