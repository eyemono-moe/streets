import {
  type ContentToken,
  isProbablyImageUrl,
  parseContent,
} from "../nostr/content";
import type { NostrEvent } from "../nostr/event";
import {
  type EventRef,
  relayOf,
  tagOnlyQuoteTargets,
} from "../nostr/event-refs";

export type NoteLayout = {
  /** 本文として流す部分。前後の空白は落としてある。 */
  text: ContentToken[];
  images: string[];
  /** 本文中の `nostr:` 参照とタグにしか無い `q` の和。同じ id は最初の 1 回だけ。 */
  quotes: EventRef[];
};

const trimEdges = (tokens: ContentToken[]): ContentToken[] => {
  const result = [...tokens];
  const first = result[0];
  if (first?.type === "text") {
    result[0] = { type: "text", text: first.text.trimStart() };
  }
  const lastIndex = result.length - 1;
  const last = result[lastIndex];
  if (last?.type === "text") {
    result[lastIndex] = { type: "text", text: last.text.trimEnd() };
  }
  return result.filter((token) => token.type !== "text" || token.text !== "");
};

/**
 * 画像と引用を本文の流れから抜き出し、本文の下にブロックとして並べる形にする。
 * 抜いた URL や参照の文字列を本文に残すと、同じものが 2 回見える。
 */
export const layoutNote = (event: NostrEvent): NoteLayout => {
  const text: ContentToken[] = [];
  const images: string[] = [];
  const quotes: EventRef[] = [];
  const quotedIds = new Set<string>();

  for (const token of parseContent(event.content, event.tags)) {
    if (token.type === "url" && isProbablyImageUrl(token.url)) {
      images.push(token.url);
      continue;
    }
    if (
      token.type === "mention" &&
      (token.ref.kind === "note" || token.ref.kind === "nevent")
    ) {
      const ref = token.ref;
      if (!quotedIds.has(ref.id)) {
        quotedIds.add(ref.id);
        const relay =
          ref.kind === "nevent" ? relayOf(ref.relays[0]) : undefined;
        quotes.push(
          relay
            ? { form: "id", id: ref.id, relay }
            : { form: "id", id: ref.id },
        );
      }
      continue;
    }
    const last = text[text.length - 1];
    if (token.type === "text" && last?.type === "text") {
      // 抜いた位置の前後を 1 つにしないと、末尾の空白を落とせない。
      text[text.length - 1] = { type: "text", text: last.text + token.text };
    } else {
      text.push(token);
    }
  }

  quotes.push(...tagOnlyQuoteTargets(event));
  return { text: trimEdges(text), images, quotes };
};
