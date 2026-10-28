import * as v from "valibot";
import type { ReactionInput } from "../nostr/reaction";
import type { ReactionContent } from "../nostr/reaction";

/**
 * いいねボタンで送るリアクションを、端末に保存していたころのキー。いまはデッキと
 * 一緒にアカウントへ保存する（`DeckSet.defaultReaction`）。アカウントにまだ無い
 * 人のために、ここに残った値を読む。
 */
export const DEFAULT_REACTION_STORAGE_KEY = "streets.v1.defaultReaction";

export const defaultReactionSchema = v.union([
  v.object({ type: v.literal("like") }),
  v.object({
    type: v.literal("text"),
    content: v.pipe(v.string(), v.minLength(1)),
  }),
  v.object({
    type: v.literal("emoji"),
    shortcode: v.pipe(v.string(), v.minLength(1)),
    url: v.pipe(v.string(), v.url()),
  }),
]);

/** 未保存・読めない値は `+`（ハート）。 */
export const loadDefaultReaction = (raw: string | null): ReactionInput => {
  if (raw === null) return { type: "like" };
  try {
    const result = v.safeParse(defaultReactionSchema, JSON.parse(raw));
    return result.success ? result.output : { type: "like" };
  } catch {
    return { type: "like" };
  }
};

export const saveDefaultReaction = (input: ReactionInput): string =>
  JSON.stringify(input);

/** 送る形から、読み取り側が返す形へ。「済み」を突き合わせるのに使う。 */
export const reactionContentOf = (input: ReactionInput): ReactionContent =>
  input.type === "emoji"
    ? { type: "emoji", name: input.shortcode, url: input.url }
    : input;
