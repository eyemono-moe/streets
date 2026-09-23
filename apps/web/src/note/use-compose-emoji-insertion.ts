import type { PickerEmoji } from "../emoji/emoji-data";
import { insertText } from "../ui/insert-text";

/**
 * 絵文字ピッカーで選んだものを本文へ入れる。ピッカーへフォーカスが移っても、
 * 本文で選んでいた範囲は欄が覚えているので、そこへ入れる。カスタム絵文字は
 * `:shortcode:` で入れる（送るときに本文から emoji タグを作る）。
 */
export const useComposeEmojiInsertion = () => {
  let field: HTMLTextAreaElement | undefined;
  return {
    ref: (element: HTMLTextAreaElement) => {
      field = element;
    },
    field: () => field,
    insert: (emoji: PickerEmoji) => {
      if (!field || field.disabled) return;
      insertText(
        field,
        emoji.kind === "unicode" ? emoji.char : `:${emoji.shortcode}:`,
      );
    },
  };
};
