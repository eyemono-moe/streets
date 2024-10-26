import * as v from "valibot";
import { deckStateV0 } from "./deckSchema/v0";

// deckStateに破壊的変更を入れる場合は、新しいバージョンを作成して、v.transformで最新バージョンに変換する

export const deckState = v.variant("version", [deckStateV0]);

export type DeckState = v.InferOutput<typeof deckState>;
export type ColumnState = DeckState["columns"][number];
export type ColumnContent<
  T extends ColumnState["content"]["type"] = ColumnState["content"]["type"],
> = Extract<ColumnState["content"], { type: T }>;
export type ColumnSize = ColumnState["size"];
