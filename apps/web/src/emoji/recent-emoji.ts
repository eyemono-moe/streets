import { createSignal } from "solid-js";
import type { PickerEmoji } from "./emoji-data";

/** よく使うものは端末ごとに覚える。ほかの端末へ持って行くほどのものではない。 */
const STORAGE_KEY = "streets.v1.recentEmojis";
const LIMIT = 24;

const read = (): PickerEmoji[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (entry): entry is PickerEmoji =>
        typeof entry === "object" &&
        entry !== null &&
        ((entry as PickerEmoji).kind === "unicode" ||
          (entry as PickerEmoji).kind === "custom"),
    );
  } catch {
    return [];
  }
};

const [recentEmojis, setValue] = createSignal(read());

export { recentEmojis };

export const emojiKey = (emoji: PickerEmoji): string =>
  emoji.kind === "unicode" ? emoji.char : `:${emoji.shortcode}:`;

/** 使ったものを先頭へ。同じものは 1 つにまとめる。 */
export const rememberEmoji = (emoji: PickerEmoji) => {
  const key = emojiKey(emoji);
  const next = [
    emoji,
    ...recentEmojis().filter((other) => emojiKey(other) !== key),
  ].slice(0, LIMIT);
  setValue(next);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // 保存できなくても、いまの画面には当たっている。
  }
};
