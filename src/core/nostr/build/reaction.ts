import type { NostrEvent } from "../event";
import type { EventDraft } from "./draft";

export type ReactionInput =
  | { type: "like" }
  | { type: "text"; content: string }
  | { type: "emoji"; shortcode: string; url: string };

/**
 * NIP-25 のリアクション。
 *
 * `k` タグは NIP-25 上は MAY だが**必ず入れる** —— 読み取り側の
 * `parseReaction` (`src/core/nostr/reaction.ts`) が既に見ており、
 * 落とすと自分で書いたものを自分で読めなくなる。
 */
export const buildReaction = (
  target: NostrEvent,
  input: ReactionInput,
): EventDraft => {
  const tags: string[][] = [
    ["e", target.id],
    ["p", target.pubkey],
    ["k", String(target.kind)],
  ];
  if (input.type === "emoji") {
    tags.push(["emoji", input.shortcode, input.url]);
  }
  return {
    kind: 7,
    tags,
    content:
      input.type === "like"
        ? "+"
        : input.type === "text"
          ? input.content
          : // NIP-25: "The content can be set only one `:shortcode:`."
            // 飾りを足すと他クライアントが素のテキストとして描く。
            `:${input.shortcode}:`,
  };
};
