import { type Nip19Ref, decodeNip19 } from "./nip19";

export type ContentToken =
  | { type: "text"; text: string }
  | { type: "url"; url: string }
  | { type: "mention"; ref: Nip19Ref; raw: string }
  | { type: "emoji"; shortcode: string; url: string }
  | { type: "hashtag"; tag: string; raw: string };

type Match = { consumed: number; token: ContentToken };

/**
 * `#`/`:` を除外しない（URL を優先順位の先頭で試すため確保される）。
 *
 * ASCII 以外も取る —— ブラウザのアドレス欄は `https://dic.pixiv.net/a/ピクシブ百科辞典`
 * のように符号化を戻して見せるので、そこからコピーした日本語のままの URL が本文に来る
 * （IRI・WHATWG URL ではこれも正しい URL）。空白で区切られていない本文を飲み込まないよう、
 * 空白と日本語の約物・括弧で止める。区切りの無いまま続く文（`…/docを見て`）は区別できず飲み込む。
 */
const URL_RE =
  /https?:\/\/(?:[A-Za-z0-9\-._~%:/?#[\]@!$&'()*+,;=]|[^\p{ASCII}\s、。，．「」『』【】《》〈〉（）［］｛｝！？：；…“”‘’])+/uy;

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
 * bech32 文字集合は本来もっと狭いが緩く英数字で切り出し、妥当性判定は
 * `decodeNip19` に委ねる（狭めても壊れた入力の切り出し方が変わるだけ）。
 */
const NOSTR_URI_RE = /nostr:([a-zA-Z0-9]+)/y;
const BARE_NIP19_RE = /(?:npub|note|nprofile|nevent|naddr)1[a-zA-Z0-9]+/iy;

const matchMention = (content: string, i: number): Match | undefined => {
  NOSTR_URI_RE.lastIndex = i;
  const m = NOSTR_URI_RE.exec(content);
  if (!m) return undefined;
  const entity = m[1];
  if (entity === undefined) return undefined;
  const ref = decodeNip19(entity);
  // 壊れている/nsec/nrelay は undefined —— token を作らず通常のテキスト前進に委ねる。本文が欠けるより失敗部分をテキストのままにする方がまし
  if (!ref) return undefined;
  return { consumed: m[0].length, token: { type: "mention", ref, raw: m[0] } };
};

/** 推奨の NIP-21 URI でない裸の NIP-19 も、他クライアントとの相互運用のため読む。 */
const matchBareMention = (content: string, i: number): Match | undefined => {
  const previous = content[i - 1];
  if (previous !== undefined && /[A-Za-z0-9_]/.test(previous)) return undefined;

  BARE_NIP19_RE.lastIndex = i;
  const m = BARE_NIP19_RE.exec(content);
  if (!m) return undefined;
  const raw = m[0];
  const ref = decodeNip19(raw);
  if (!ref) return undefined;
  return { consumed: raw.length, token: { type: "mention", ref, raw } };
};

/** NIP-30 が MUST として定める形。この形に合わないタグは索引に入れない。 */
const SHORTCODE_RE = /^[A-Za-z0-9_-]+$/;

/**
 * 本文側の候補切り出しは `SHORTCODE_RE` と同じ文字集合を強制しない（強制すると
 * 「不正な形のタグを無視した」ことが観測不能になる）。妥当性は索引の存在だけで判定する。
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
  // 索引に無いショートコードはテキストのまま —— そうしないと "12:30:45" や "ratio:1:2" のような時刻・比率表記が絵文字候補になってしまう
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
  // NIP-24 に合わせ小文字化するのは tag 側だけ —— カラムの #t 検索は小文字で引くため。raw は画面表示用に元の表記を保つ
  return {
    consumed: m[0].length,
    token: { type: "hashtag", tag: tag.toLowerCase(), raw: m[0] },
  };
};

/**
 * `emoji` タグの索引は呼び出しごとに 1 回だけ作る（毎回走査だと二乗コストになる）。
 * 文字集合に合わない/画像 URL が空欠落のタグは除外し、複数の妥当なタグは先勝ちで保持する。
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
 * 本文をトークン列に分ける。連結すると元の `content` に戻ることが不変条件で、
 * 欠落/重複を検出する唯一の手段（`content.test.ts` 参照）。例外は投げない（ErrorBoundary 無し）。
 */
export const parseContent = (
  content: string,
  tags: readonly string[][],
): ContentToken[] => {
  if (content === "") return [];

  const emojiIndex = buildEmojiIndex(tags);
  const tokens: ContentToken[] = [];
  let textStart = 0;
  let i = 0;

  while (i < content.length) {
    // URL → nostr: → 裸の NIP-19 → :shortcode: → #hashtag の順で試す —— URL を最初にし、URL 内の文字列を横取りしない
    const matched =
      matchUrl(content, i) ??
      matchMention(content, i) ??
      matchBareMention(content, i) ??
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
const VIDEO_EXTENSIONS = new Set(["mp4", "webm", "mov", "m4v"]);
const AUDIO_EXTENSIONS = new Set([
  "mp3",
  "m4a",
  "aac",
  "ogg",
  "oga",
  "opus",
  "wav",
  "flac",
]);

const urlExtension = (url: string): string | undefined => {
  const withoutQueryOrFragment = url.split(/[?#]/)[0] ?? url;
  return /\.([a-zA-Z0-9]+)$/.exec(withoutQueryOrFragment)?.[1]?.toLowerCase();
};

/** 拡張子だけを見る。実際に画像かどうかは取得してみるまで分からない。 */
export const isProbablyImageUrl = (url: string): boolean => {
  const ext = urlExtension(url);
  return ext !== undefined && IMAGE_EXTENSIONS.has(ext);
};

/** 拡張子だけを見る。再生できるかどうかはブラウザに委ねる。 */
export const isProbablyVideoUrl = (url: string): boolean => {
  const ext = urlExtension(url);
  return ext !== undefined && VIDEO_EXTENSIONS.has(ext);
};

/** 拡張子だけを見る。再生できるかどうかはブラウザに委ねる。 */
export const isProbablyAudioUrl = (url: string): boolean => {
  const ext = urlExtension(url);
  return ext !== undefined && AUDIO_EXTENSIONS.has(ext);
};
