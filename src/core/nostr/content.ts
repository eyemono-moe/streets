import type { NostrEvent } from "./event";
import { type Nip19Ref, decodeNip19 } from "./nip19";

export type ContentToken =
  | { type: "text"; text: string }
  | { type: "url"; url: string }
  | { type: "mention"; ref: Nip19Ref; raw: string }
  | { type: "emoji"; shortcode: string; url: string }
  | { type: "hashtag"; tag: string; raw: string };

type Match = { consumed: number; token: ContentToken };

/**
 * `\S+` は貪欲に非空白をすべて取る。`#`（フラグメント）や `:`（ポート番号）
 * を意図的に除外していない —— URL をこの優先順位の先頭で試すことで、
 * それらが後続のハッシュタグ/絵文字マッチャに渡る前に丸ごと確保される。
 */
// RFC 3986 が URI に許す文字はすべて ASCII。`\S+` で取ると
// `https://example.com/doc。ご確認ください` のように区切りの空白が無い
// 日本語の本文で、URL が後続の文章を丸ごと飲み込む。
const URL_RE = /https?:\/\/[A-Za-z0-9\-._~%:/?#[\]@!$&'()*+,;=]+/y;

/** URL の外側にある約物であり、URL 自体が保持する情報ではない。 */
const TRAILING_PUNCTUATION = new Set([
  ")",
  "]",
  "}",
  ".",
  ",",
  "!",
  "?",
  "'",
  '"',
  "、",
  "。",
  "」",
  "』",
  "】",
  "》",
  "”",
  "’",
]);

/**
 * 末尾の `)` は URL 内で開き括弧と対になっている場合がある
 * （例: `.../Example_(disambiguation)`）。対になっていない分だけを剥がす。
 */
const trimTrailingPunctuation = (raw: string): string => {
  let end = raw.length;
  while (end > 0) {
    const ch = raw[end - 1];
    if (ch === ")") {
      const candidate = raw.slice(0, end);
      const opens = candidate.split("(").length - 1;
      const closes = candidate.split(")").length - 1;
      if (closes <= opens) break;
      end -= 1;
      continue;
    }
    if (ch !== undefined && TRAILING_PUNCTUATION.has(ch)) {
      end -= 1;
      continue;
    }
    break;
  }
  return raw.slice(0, end);
};

const matchUrl = (content: string, i: number): Match | undefined => {
  URL_RE.lastIndex = i;
  const m = URL_RE.exec(content);
  if (!m) return undefined;
  const url = trimTrailingPunctuation(m[0]);
  if (url.length === 0) return undefined;
  return { consumed: url.length, token: { type: "url", url } };
};

/**
 * bech32 の文字集合は本来もっと狭いが、ここでは緩く英数字で切り出し、
 * 妥当性の判定は `decodeNip19` に委ねる。狭めすぎると壊れた入力の
 * 切り出し方が変わるだけで、結局 `decodeNip19` が undefined を返す。
 */
const NOSTR_URI_RE = /nostr:([a-zA-Z0-9]+)/y;

const matchMention = (content: string, i: number): Match | undefined => {
  NOSTR_URI_RE.lastIndex = i;
  const m = NOSTR_URI_RE.exec(content);
  if (!m) return undefined;
  const entity = m[1];
  if (entity === undefined) return undefined;
  const ref = decodeNip19(entity);
  // 壊れている/nsec/nrelay は undefined —— ここで token を作らず、呼び出し側の
  // 通常のテキスト前進に委ねる。落とす（本文が欠ける）よりましという 7 節の方針。
  if (!ref) return undefined;
  return { consumed: m[0].length, token: { type: "mention", ref, raw: m[0] } };
};

/** NIP-30 が MUST として定める形。この形に合わないタグは索引に入れない。 */
const SHORTCODE_RE = /^[A-Za-z0-9_-]+$/;

/**
 * 本文側の候補切り出しはこの文字集合を強制しない。強制すると
 * `SHORTCODE_RE` と同じ集合になり、不正な形のタグが索引に絶対に
 * 入らない一方で本文の候補も同じ集合でしか作られなくなるため、
 * 「不正な形のタグを無視した」ことが観測不能になる。妥当性の判定は
 * 索引に存在するかどうかだけに委ねる。
 */
const EMOJI_RE = /:([^\s:]+):/y;

const matchEmoji = (
  content: string,
  i: number,
  emojiIndex: ReadonlyMap<string, string>,
): Match | undefined => {
  EMOJI_RE.lastIndex = i;
  const m = EMOJI_RE.exec(content);
  if (!m) return undefined;
  const shortcode = m[1];
  if (shortcode === undefined) return undefined;
  const url = emojiIndex.get(shortcode);
  // 索引に無いショートコードはテキストのまま —— そうしないと "12:30:45" や
  // "ratio:1:2" のような時刻・比率表記が絵文字候補になってしまう。
  if (url === undefined) return undefined;
  return { consumed: m[0].length, token: { type: "emoji", shortcode, url } };
};

/**
 * 日本語のハッシュタグは実在する。ASCII だけに絞ると日本語圏で使い物に
 * ならないため、Unicode の文字クラスを使う。
 */
const HASHTAG_RE = /#([\p{L}\p{N}_-]+)/uy;

const matchHashtag = (content: string, i: number): Match | undefined => {
  HASHTAG_RE.lastIndex = i;
  const m = HASHTAG_RE.exec(content);
  if (!m) return undefined;
  const tag = m[1];
  if (tag === undefined) return undefined;
  // NIP-24 に合わせて小文字化するのは tag 側だけ。raw は元の表記を保つ
  // —— カラムのハッシュタグ検索は #t を小文字で引くので、tag を揃えないと
  // タップしても何も出ない。raw は画面にそのまま出す表記として残す。
  return {
    consumed: m[0].length,
    token: { type: "hashtag", tag: tag.toLowerCase(), raw: m[0] },
  };
};

/**
 * `emoji` タグの索引を呼び出しごとに 1 回だけ作る。ショートコードの出現
 * 回数ぶんタグ配列を走査すると、絵文字の多い本文で二乗コストになる。
 *
 * 文字集合に合わない、または画像 URL が空/欠落しているタグは索引に
 * 入れない —— その時点でそのタグ自体を「無かったこと」として扱うので、
 * 同じショートコードの後続タグ（妥当なもの）が索引に入る余地は残る。
 * 妥当なタグが複数あれば、索引は最初のものだけを保持する（先勝ち）。
 */
const buildEmojiIndex = (tags: readonly string[][]): Map<string, string> => {
  const index = new Map<string, string>();
  for (const tag of tags) {
    if (tag[0] !== "emoji") continue;
    const shortcode = tag[1];
    const url = tag[2];
    if (shortcode === undefined || !SHORTCODE_RE.test(shortcode)) continue;
    if (url === undefined || url === "") continue;
    if (index.has(shortcode)) continue;
    index.set(shortcode, url);
  }
  return index;
};

/**
 * 本文をトークン列に分ける。**連結すると元の `content` に戻ることが不変
 * 条件** —— 文字を落とす/重複させるバグは画面には出ないので、この不変
 * 条件だけが機械的な検出手段になる（content.test.ts 参照）。
 *
 * 例外を投げない。レンダラの中から呼ばれ、このアプリに ErrorBoundary は
 * 無いため、1 件の壊れたイベントがカラム全体を落とすことになる。
 */
export const parseContent = (event: NostrEvent): ContentToken[] => {
  const content = event.content;
  if (content === "") return [];

  const emojiIndex = buildEmojiIndex(event.tags);
  const tokens: ContentToken[] = [];
  let textStart = 0;
  let i = 0;

  while (i < content.length) {
    // URL → nostr: → :shortcode: → #hashtag の順で試す（仕様 4 節）。URL を
    // 最初に試すことで、フラグメントの `#` やポート番号の `:` がそれぞれ
    // ハッシュタグ・絵文字候補として横取りされるのを避ける。
    const matched =
      matchUrl(content, i) ??
      matchMention(content, i) ??
      matchEmoji(content, i, emojiIndex) ??
      matchHashtag(content, i);

    if (matched) {
      if (i > textStart) {
        tokens.push({ type: "text", text: content.slice(textStart, i) });
      }
      tokens.push(matched.token);
      i += matched.consumed;
      textStart = i;
    } else {
      i += 1;
    }
  }

  if (textStart < content.length) {
    tokens.push({ type: "text", text: content.slice(textStart) });
  }

  return tokens;
};

const IMAGE_EXTENSIONS = new Set([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "avif",
  "bmp",
  "svg",
]);

/** 拡張子だけを見る。実際に画像かどうかは取得してみるまで分からない。 */
export const isProbablyImageUrl = (url: string): boolean => {
  const withoutQueryOrFragment = url.split(/[?#]/)[0] ?? url;
  const match = /\.([a-zA-Z0-9]+)$/.exec(withoutQueryOrFragment);
  if (!match) return false;
  const ext = match[1];
  return ext !== undefined && IMAGE_EXTENSIONS.has(ext.toLowerCase());
};
