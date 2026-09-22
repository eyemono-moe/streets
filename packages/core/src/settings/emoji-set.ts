import { type Mutation, replaceTags } from "../nostr/build/draft";
import type { NostrEvent } from "../nostr/event";
import {
  type CustomEmoji,
  EMOJI_SET_KIND,
  parseCustomEmojis,
} from "./emoji-list";

export type EmojiSet = {
  identifier: string;
  pubkey: string;
  /** 見出しに出す名前。`title` が無ければ `d` の値をそのまま使う。 */
  title: string;
  emojis: CustomEmoji[];
};

const tagValue = (event: NostrEvent, name: string): string | undefined => {
  for (const tag of event.tags) {
    if (tag[0] === name && tag[1]) return tag[1];
  }
  return undefined;
};

/**
 * kind:30030 を読む。`d` が無いものは、指し示す方法が無いので読まない
 * （NIP-01 上は `d` 無し＝空文字だが、名前の無いセットは画面に出せない）。
 */
export const parseEmojiSet = (
  event: NostrEvent | undefined,
): EmojiSet | undefined => {
  if (!event || event.kind !== EMOJI_SET_KIND) return undefined;
  const identifier = tagValue(event, "d");
  if (!identifier) return undefined;
  return {
    identifier,
    pubkey: event.pubkey,
    title: tagValue(event, "title") ?? identifier,
    emojis: parseCustomEmojis(event),
  };
};

/** セットの中身を丸ごと差し替える。並び順は渡されたまま。 */
export const setEmojiSetEmojis =
  (emojis: readonly CustomEmoji[]): Mutation =>
  (current) =>
    replaceTags(current, EMOJI_SET_KIND, "emoji", () =>
      emojis.map((emoji) => ["emoji", emoji.shortcode, emoji.url]),
    );

/** 見出しに出す名前を変える。`d` は変えない —— 変えると別のセットになる。 */
export const setEmojiSetTitle =
  (title: string): Mutation =>
  (current) =>
    replaceTags(current, EMOJI_SET_KIND, "title", () => [["title", title]]);
