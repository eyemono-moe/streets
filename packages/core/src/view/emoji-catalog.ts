import type {
  CustomEmoji,
  EmojiList,
  EmojiSetRef,
} from "../settings/emoji-list";
import { emojiSetAddress } from "../settings/emoji-list";
import type { EmojiSet } from "../settings/emoji-set";

/** ピッカーに並べる 1 かたまり。見出しを付けて出す。 */
export type EmojiGroup = {
  /** 見出しの id。ピッカーのタブはこれで行き先を指す。 */
  id: string;
  title: string;
  emojis: CustomEmoji[];
};

/** kind:10030 が直接持っている絵文字の置き場所。 */
export const OWN_EMOJI_GROUP_ID = "own";

const dedupe = (emojis: readonly CustomEmoji[]): CustomEmoji[] => {
  const seen = new Set<string>();
  const result: CustomEmoji[] = [];
  for (const emoji of emojis) {
    if (seen.has(emoji.shortcode)) continue;
    seen.add(emoji.shortcode);
    result.push(emoji);
  }
  return result;
};

const setOf = (
  sets: readonly EmojiSet[],
  ref: EmojiSetRef,
): EmojiSet | undefined =>
  sets.find(
    (set) => set.pubkey === ref.pubkey && set.identifier === ref.identifier,
  );

/**
 * 自分の絵文字を、見出し付きのかたまりに分ける。並びは kind:10030 に書かれた
 * 順（使う人が並べた順として扱う）。
 *
 * まだ届いていないセットは出さない —— 中身の無い見出しだけが並ぶと、読み込み
 * 中なのか空なのか見分けが付かない。
 */
export const customEmojiGroups = (
  list: EmojiList,
  sets: readonly EmojiSet[],
): EmojiGroup[] => {
  const groups: EmojiGroup[] = [];
  const own = dedupe(list.emojis);
  if (own.length > 0) {
    groups.push({ id: OWN_EMOJI_GROUP_ID, title: "自分の絵文字", emojis: own });
  }
  for (const ref of list.sets) {
    const set = setOf(sets, ref);
    if (!set || set.emojis.length === 0) continue;
    groups.push({
      id: emojiSetAddress(ref),
      title: set.title,
      emojis: dedupe(set.emojis),
    });
  }
  return groups;
};

/**
 * ショートコードから絵文字を引く。同じ名前が複数のかたまりにあるときは、
 * 先にあるほう（使う人が上に並べたほう）を使う。
 */
export const findCustomEmoji = (
  groups: readonly EmojiGroup[],
  shortcode: string,
): CustomEmoji | undefined => {
  for (const group of groups) {
    const found = group.emojis.find((emoji) => emoji.shortcode === shortcode);
    if (found) return found;
  }
  return undefined;
};
