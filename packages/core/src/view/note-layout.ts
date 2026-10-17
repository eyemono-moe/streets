import { addressOfNaddr, formatEventAddress } from "../nostr/address";
import {
  type ContentToken,
  isProbablyAudioUrl,
  isProbablyImageUrl,
  isProbablyVideoUrl,
  parseContent,
} from "../nostr/content";
import type { NostrEvent } from "../nostr/event";
import { type EventRef, idRefOfPointer, relayOf } from "../nostr/event-refs";
import {
  type InlineMediaMetadata,
  type MediaDimensions,
  inlineMediaMetadata,
} from "../nostr/imeta";
import { PICTURE_KIND, isMediaPostKind } from "../nostr/media-post";
import { tagOnlyQuoteTargets } from "../nostr/quote";

export type NoteMedia = {
  type: "image" | "video";
  url: string;
  dimensions?: MediaDimensions;
  blurhash?: string;
  /** 種類を拡張子から推したのではなく、`imeta` の `m` や kind で書かれていた。 */
  typeKnown?: true;
  thumb?: string;
};

export type MediaAttempt = { type: "image" | "video"; url: string };

/**
 * 読めなかったときに次に試すものを、試す順に並べる。種類を推しただけなら同じ URL を
 * もう一方の種類で読み直す。種類が書かれていれば読み直さない（Chromium の `<video>` は
 * HEIC を開けてしまい、画像が 0 秒の動画になる）。
 */
export const mediaAttempts = (media: NoteMedia): MediaAttempt[] => {
  const attempts: MediaAttempt[] = [{ type: media.type, url: media.url }];
  if (!media.typeKnown) {
    attempts.push({
      type: media.type === "image" ? "video" : "image",
      url: media.url,
    });
  }
  if (media.thumb) attempts.push({ type: "image", url: media.thumb });
  return attempts;
};

const mediaDetails = (
  details: InlineMediaMetadata | undefined,
): Pick<NoteMedia, "dimensions" | "blurhash" | "thumb"> => ({
  ...(details?.dimensions ? { dimensions: details.dimensions } : {}),
  ...(details?.blurhash ? { blurhash: details.blurhash } : {}),
  ...(details?.thumb ? { thumb: details.thumb } : {}),
});

/**
 * 投稿を上から順に描く単位。画像・動画は `media` の位置で指す。拡大表示は投稿の画像・動画を
 * 全部並べた列で送るので、ブロックに中身を写さない。
 */
export type NoteBlock =
  | { type: "text"; tokens: ContentToken[] }
  | { type: "media"; index: number }
  /** 拡大表示で送る画像・動画の並びに混ぜると、絵の無い頁ができるので分けて持つ。 */
  | { type: "audio"; url: string }
  | { type: "quote"; quote: EventRef };

export type NoteLayout = {
  /** 本文の文字だけを 1 続きにしたもの。前後の空白は落としてある。 */
  text: ContentToken[];
  /** 書かれた順のブロック。各本文ブロックの前後の空白も落としてある。 */
  blocks: NoteBlock[];
  media: NoteMedia[];
  /**
   * カードにするリンク（画像・動画・音声でない http(s) の URL）。本文にもリンクとして
   * 残す。同じ URL は 1 回、先頭から `MAX_LINK_CARDS` 件まで。
   */
  links: string[];
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

const appendToken = (tokens: ContentToken[], token: ContentToken) => {
  const last = tokens[tokens.length - 1];
  if (token.type === "text" && last?.type === "text") {
    // 抜いた位置の前後を 1 つにしないと、末尾の空白を落とせない。
    tokens[tokens.length - 1] = { type: "text", text: last.text + token.text };
  } else {
    tokens.push(token);
  }
};

/**
 * 画像・動画・音声と引用を本文の流れから抜き出し、書かれた位置のブロックにする。
 * 抜いた URL や参照の文字列を本文に残すと、同じものが 2 回見える。引用は本文中の
 * `nostr:` 参照とタグにしか無い `q` の和で、同じものは最初の 1 回だけ。タグにしか無い
 * 引用と `imeta` にしか無い画像・動画は、書かれた位置が無いので末尾に置く。
 * `quotes: false` のときは引用を抜かず、参照を本文の文字として残す。
 */
export const layoutNote = (
  event: NostrEvent,
  options: { quotes: boolean },
): NoteLayout => {
  const text: ContentToken[] = [];
  const blocks: NoteBlock[] = [];
  let run: ContentToken[] = [];
  const media: NoteLayout["media"] = [];
  const links: string[] = [];
  const quotedIds = new Set<string>();
  const quotedAddresses = new Set<string>();
  const metadata = inlineMediaMetadata(event.tags);
  const flushRun = () => {
    const tokens = trimEdges(run);
    if (tokens.length > 0) blocks.push({ type: "text", tokens });
    run = [];
  };
  const place = (block: NoteBlock) => {
    flushRun();
    blocks.push(block);
  };

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
        place({ type: "audio", url: token.url });
        continue;
      }
      if (type) {
        place({ type: "media", index: media.length });
        media.push({
          type,
          url: token.url,
          ...(mime ? { typeKnown: true } : {}),
          ...mediaDetails(details),
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
        const quote = idRefOfPointer(ref);
        if (quote) place({ type: "quote", quote });
      }
      continue;
    }
    if (
      options.quotes &&
      token.type === "mention" &&
      token.ref.kind === "naddr"
    ) {
      const address = addressOfNaddr(token.ref);
      if (address) {
        const key = formatEventAddress(address);
        if (!quotedAddresses.has(key)) {
          quotedAddresses.add(key);
          const relay = relayOf(token.ref.relays[0]);
          place({
            type: "quote",
            quote: relay
              ? { form: "address", address: key, relay }
              : { form: "address", address: key },
          });
        }
        continue;
      }
    }
    appendToken(text, token);
    appendToken(run, token);
  }
  flushRun();

  // 画像・動画の投稿は、見せるものを本文ではなく `imeta` にだけ書く。
  if (isMediaPostKind(event.kind)) {
    for (const [url, details] of metadata) {
      if (media.some((item) => item.url === url)) continue;
      const mime = details.mime?.toLowerCase();
      const declared = mime?.startsWith("video/")
        ? "video"
        : mime?.startsWith("image/")
          ? "image"
          : event.kind === PICTURE_KIND
            ? "image"
            : undefined;
      blocks.push({ type: "media", index: media.length });
      media.push({
        type: declared ?? "video",
        url,
        ...(declared ? { typeKnown: true } : {}),
        ...mediaDetails(details),
      });
    }
  }
  if (options.quotes) {
    for (const quote of tagOnlyQuoteTargets(event)) {
      blocks.push({ type: "quote", quote });
    }
  }
  return { text: trimEdges(text), blocks, media, links };
};
