/**
 * NIP-31 の `alt` タグ。知らない kind が流れてきたときに見せる、その内容の短い説明。
 *
 * "clients should use an `alt` tag to write a short human-readable plaintext summary of
 * what that event is about."
 */
import type { NostrEvent } from "./event";

/** 空白だけのものは書いていないのと同じに扱う。 */
export const altText = (event: NostrEvent): string | undefined => {
  for (const tag of event.tags) {
    if (tag[0] !== "alt") continue;
    const text = tag[1]?.trim();
    if (text) return text;
  }
  return undefined;
};
