import * as v from "valibot";
import type { ReactionInput } from "../nostr/build/reaction";
import type { ReactionContent } from "../nostr/reaction";

/**
 * いいねボタンで送るリアクション。端末ごとの設定 —— 手元のピッカーの
 * 最近使った絵文字と同じく、ほかの端末へ持って行くほどのものではない。
 */
export const DEFAULT_REACTION_STORAGE_KEY = "streets.v1.defaultReaction";

const schema = v.union([
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
    const result = v.safeParse(schema, JSON.parse(raw));
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
