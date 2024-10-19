import * as v from "valibot";

// TODO: StandardListとSetの両方を使用できるように
const columnContent = v.variant("type", [
  v.object({
    type: v.literal("search"),
    query: v.string(),
  }),
  v.object({
    // kind: 10003
    type: v.literal("bookmarks"),
    pubkey: v.string(),
  }),
  v.object({
    type: v.literal("notifications"),
  }),
  v.object({
    // 特定ユーザーのいいね欄
    type: v.literal("reactions"),
    pubkey: v.string(),
  }),
  v.object({
    // 特定ユーザーの投稿と固定ポストを表示
    type: v.literal("user"),
    pubkey: v.string(),
  }),
  v.object({
    type: v.literal("timeline"),
  }),
  v.object({
    type: v.literal("followees"),
    pubkey: v.string(),
  }),
  v.object({
    type: v.literal("followers"),
    pubkey: v.string(),
  }),
]);

const columnsScheme = v.object({
  content: columnContent,
  tempContent: v.optional(columnContent),
  size: v.union([v.literal("small"), v.literal("medium"), v.literal("large")]),
});

export const deckStateV0 = v.object({
  version: v.literal(0),
  columns: v.array(columnsScheme),
  display: v.object({
    theme: v.object({
      accent: v.string(),
      ui: v.string(),
    }),
  }),
});
