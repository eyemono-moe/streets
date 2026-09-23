/**
 * 文字を打つ欄の範囲を置き換え、カーソルを入れたものの後ろへ置く。ブラウザの
 * 入力として入れるので、取り消し（Ctrl+Z）で戻せ、欄の `input` も走る。
 * 使えないブラウザでは直に書き換え、`input` を自分で送る。
 */
export const insertText = (
  field: HTMLInputElement | HTMLTextAreaElement,
  text: string,
  range: { start: number; end: number } = {
    start: field.selectionStart ?? field.value.length,
    end: field.selectionEnd ?? field.value.length,
  },
): void => {
  field.focus();
  field.setSelectionRange(range.start, range.end);
  if (!document.execCommand("insertText", false, text)) {
    field.setRangeText(text, range.start, range.end, "end");
    field.dispatchEvent(new Event("input", { bubbles: true }));
  }
  const caret = range.start + text.length;
  field.setSelectionRange(caret, caret);
};
