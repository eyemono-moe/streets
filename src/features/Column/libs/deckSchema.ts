import * as v from "valibot";

// TODO: StandardListとSetの両方を使用できるように
const columnSchemeV0 = v.intersect([
  v.variant("type", [
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
  ]),
  v.object({
    size: v.union([
      v.literal("small"),
      v.literal("medium"),
      v.literal("large"),
    ]),
  }),
]);

export const deckState = v.object({
  version: v.literal(0),
  columns: v.array(columnSchemeV0),
  display: v.object({
    theme: v.object({
      accent: v.string(),
      ui: v.string(),
    }),
  }),
});

export type DeckState = v.InferOutput<typeof deckState>;
export type ColumnState = DeckState["columns"][number];
export type PickColumnState<T extends ColumnState["type"]> = Extract<
  ColumnState,
  { type: T }
>;
