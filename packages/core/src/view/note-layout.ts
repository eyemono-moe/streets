import {
  type ContentToken,
  isProbablyAudioUrl,
  isProbablyImageUrl,
  isProbablyVideoUrl,
  parseContent,
} from "../nostr/content";
import type { NostrEvent } from "../nostr/event";
import {
  type EventRef,
  relayOf,
  tagOnlyQuoteTargets,
} from "../nostr/event-refs";
import { type MediaDimensions, inlineMediaMetadata } from "../nostr/imeta";

export type NoteMedia = {
  type: "image" | "video";
  url: string;
  dimensions?: MediaDimensions;
  blurhash?: string;
};

export type NoteLayout = {
  /** 本文として流す部分。前後の空白は落としてある。 */
  text: ContentToken[];
  media: NoteMedia[];
  /**
   * 再生する音声の URL。拡大表示で送る画像・動画の並びに混ぜると、
   * 絵の無い頁ができるので分けて持つ。
   */
  audio: string[];
  /**
   * カードにするリンク（画像・動画・音声でない http(s) の URL）。本文にもリンクとして
   * 残す。同じ URL は 1 回、先頭から `MAX_LINK_CARDS` 件まで。
   */
  links: string[];
  /** 本文中の `nostr:` 参照とタグにしか無い `q` の和。同じ id は最初の 1 回だけ。 */
  quotes: EventRef[];
};

/** 1 件の投稿に並べるカードの上限。URL を並べただけの投稿で縦に伸びすぎない。 */
export const MAX_LINK_CARDS = 3;

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
 * 画像・動画・音声と引用を本文の流れから抜き出し、本文の下にブロックとして並べる形にする。
 * 抜いた URL や参照の文字列を本文に残すと、同じものが 2 回見える。
 * `quotes: false` のときは引用を抜かず、参照を本文の文字として残す。
 */
export const layoutNote = (
  event: NostrEvent,
  options: { quotes: boolean },
): NoteLayout => {
  const text: ContentToken[] = [];
  const media: NoteLayout["media"] = [];
  const audio: string[] = [];
  const links: string[] = [];
  const quotes: EventRef[] = [];
  const quotedIds = new Set<string>();
  const metadata = inlineMediaMetadata(event.tags);

  for (const token of parseContent(event.content, event.tags)) {
    if (token.type === "url") {
      const details = metadata.get(token.url);
      const mime = details?.mime?.toLowerCase();
      const type = mime
        ? mime.startsWith("image/")
          ? "image"
          : mime.startsWith("video/")
            ? "video"
            : mime.startsWith("audio/")
              ? "audio"
              : undefined
        : isProbablyImageUrl(token.url)
          ? "image"
          : isProbablyVideoUrl(token.url)
            ? "video"
            : isProbablyAudioUrl(token.url)
              ? "audio"
              : undefined;
      if (type === "audio") {
        audio.push(token.url);
        continue;
      }
      if (type) {
        media.push({
          type,
          url: token.url,
          ...(details?.dimensions ? { dimensions: details.dimensions } : {}),
          ...(details?.blurhash ? { blurhash: details.blurhash } : {}),
        });
        continue;
      }
      // カードは本文の下に足すだけで、リンクは本文に残す（どこを指していたか読めるように）。
      if (links.length < MAX_LINK_CARDS && !links.includes(token.url)) {
        links.push(token.url);
      }
    }
    if (
      options.quotes &&
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

  if (options.quotes) quotes.push(...tagOnlyQuoteTargets(event));
  return { text: trimEdges(text), media, audio, links, quotes };
};
