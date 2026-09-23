import {
  type Mutation,
  addTagValue,
  removeTagValue,
  replaceTags,
} from "../nostr/build/draft";
import type { NostrEvent } from "../nostr/event";

/**
 * 自分の絵文字（NIP-51 の kind:10030）。ピッカーに出すものをここで決める。
 * 絵文字そのものを直接持つ（`emoji` タグ）ことも、誰かが作った絵文字セット
 * （kind:30030）を参照する（`a` タグ）こともできる。
 */
export const EMOJI_LIST_KIND = 10_030;

/** 絵文字セット（NIP-30 の kind:30030）。 */
export const EMOJI_SET_KIND = 30_030;

export type CustomEmoji = {
  /** `:shortcode:` の中身。同じ名前が複数あっても、ここでは落とさない。 */
  shortcode: string;
  url: string;
};

/** 参照している絵文字セット。実体は別のイベントなので、指す先だけを持つ。 */
export type EmojiSetRef = {
  pubkey: string;
  identifier: string;
};

export type EmojiList = {
  emojis: CustomEmoji[];
  sets: EmojiSetRef[];
};

/** `30030:<pubkey>:<identifier>` の形。壊れていれば undefined。 */
export const parseEmojiSetAddress = (
  value: string | undefined,
): EmojiSetRef | undefined => {
  if (!value) return undefined;
  const [kind, pubkey, ...rest] = value.split(":");
  if (kind !== String(EMOJI_SET_KIND) || !pubkey) return undefined;
  // identifier に `:` が入ることはあるので、3 つ目以降は繋ぎ直す。
  const identifier = rest.join(":");
  if (identifier === "") return undefined;
  return { pubkey, identifier };
};

export const emojiSetAddress = (ref: EmojiSetRef): string =>
  `${EMOJI_SET_KIND}:${ref.pubkey}:${ref.identifier}`;

/** `emoji` タグ（NIP-30）。名前と URL が揃っているものだけを拾う。 */
export const parseCustomEmojis = (
  event: NostrEvent | undefined,
): CustomEmoji[] => {
  if (!event) return [];
  const emojis: CustomEmoji[] = [];
  for (const tag of event.tags) {
    if (tag[0] !== "emoji") continue;
    const shortcode = tag[1];
    const url = tag[2];
    if (!shortcode || !url) continue;
    emojis.push({ shortcode, url });
  }
  return emojis;
};

/** kind:10030 を読む。並び順は書かれたまま（使う人が並べた順として扱う）。 */
export const parseEmojiList = (event: NostrEvent | undefined): EmojiList => {
  const sets: EmojiSetRef[] = [];
  for (const tag of event?.tags ?? []) {
    if (tag[0] !== "a") continue;
    const ref = parseEmojiSetAddress(tag[1]);
    if (!ref) continue;
    if (sets.some((other) => emojiSetAddress(other) === emojiSetAddress(ref))) {
      continue;
    }
    sets.push(ref);
  }
  return { emojis: parseCustomEmojis(event), sets };
};

/**
 * NIP-30 のショートコードに使える文字。英数字とハイフンとアンダースコアだけ
 * で、日本語や記号は使えない（`:` で囲んだ形を本文から見つけるため）。
 */
const SHORTCODE = /^[0-9a-zA-Z_-]+$/;

export const isEmojiShortcode = (value: string): boolean =>
  SHORTCODE.test(value);

/**
 * 選んだ画像のファイル名から、名前の候補を作る。使えない文字を落とすと
 * 意味の残らない名前（`ねこ-01.png` → `-01`）になるので、英字が 1 つも
 * 残らなければ諦めて空にする —— 打ってもらったほうが早い。
 */
export const emojiShortcodeFromFileName = (fileName: string): string => {
  const candidate = fileName
    .replace(/\.[^.]+$/, "")
    .replace(/[^0-9a-zA-Z_-]/g, "")
    .replace(/^[-_]+|[-_]+$/g, "")
    .slice(0, 32);
  return /[a-zA-Z]/.test(candidate) ? candidate : "";
};

export const addEmojiSet = (ref: EmojiSetRef): Mutation =>
  addTagValue(EMOJI_LIST_KIND, "a", emojiSetAddress(ref));

export const removeEmojiSet = (ref: EmojiSetRef): Mutation =>
  removeTagValue(EMOJI_LIST_KIND, "a", emojiSetAddress(ref));

/**
 * 絵文字を 1 つ足す。同じショートコードが既にあれば URL を差し替える ——
 * 同じ名前で中身が違うものが 2 つ並ぶと、どちらが送られるか読めなくなる。
 */
export const addEmoji =
  (emoji: CustomEmoji): Mutation =>
  (current) =>
    replaceTags(current, EMOJI_LIST_KIND, "emoji", (existing) => {
      const tag = ["emoji", emoji.shortcode, emoji.url];
      return existing.some((other) => other[1] === emoji.shortcode)
        ? existing.map((other) => (other[1] === emoji.shortcode ? tag : other))
        : [...existing, tag];
    });

export const removeEmoji = (shortcode: string): Mutation =>
  removeTagValue(EMOJI_LIST_KIND, "emoji", shortcode);
