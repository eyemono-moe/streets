import type { NostrEvent } from "../nostr/event";

// 本文が人の書いた文章である kind。ほかは JSON や空が入るので、そのまま 1 行に出さない。
const TEXT_KINDS: ReadonlySet<number> = new Set([1, 11, 42, 1111]);

const collapse = (text: string) => text.replace(/\s+/g, " ").trim();

/**
 * 引用を 1 行に畳むときの、投稿の中身を表す短い文字列。
 * 文章の kind は本文（nostr: の参照は除く）、そうでなければ NIP-31 の `alt`、無ければ空。
 */
export const quotePreview = (event: NostrEvent): string => {
  if (TEXT_KINDS.has(event.kind)) {
    return collapse(event.content.replace(/nostr:\S+/g, ""));
  }
  const alt = event.tags.find((tag) => tag[0] === "alt")?.[1];
  return alt ? collapse(alt) : "";
};
