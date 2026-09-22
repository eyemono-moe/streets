type Field = HTMLInputElement | HTMLTextAreaElement;

/** 文字の並びと大きさに効くもの。これを写さないと、写しの中で折り返す位置がずれる。 */
const COPIED = [
  "box-sizing",
  "width",
  "font-family",
  "font-size",
  "font-style",
  "font-variant",
  "font-weight",
  "font-feature-settings",
  "letter-spacing",
  "line-height",
  "padding-top",
  "padding-right",
  "padding-bottom",
  "padding-left",
  "border-top-width",
  "border-right-width",
  "border-bottom-width",
  "border-left-width",
  "text-indent",
  "text-transform",
  "word-spacing",
  "tab-size",
] as const;

/** 入力欄の枠の左上から見た、ある文字の位置（欄の中の送りは含めない）。 */
export type CaretOffset = { left: number; top: number; height: number };

/**
 * 入力欄の中で、`index` 文字目がどこにあるか。欄と同じ形の見えない写しを作り、
 * そこに印を置いて測る（入力欄は文字ごとの位置を教えない）。
 *
 * 写しを body に足して外すので、打った内容が変わったときにだけ呼ぶ。位置を
 * 決め直すたびに呼ぶと、body の変化を見張っている部品（ポップアップ）が
 * また位置を決め直し、止まらなくなる。
 */
export const caretOffset = (field: Field, index: number): CaretOffset => {
  const style = getComputedStyle(field);
  const mirror = document.createElement("div");
  for (const name of COPIED) {
    mirror.style.setProperty(name, style.getPropertyValue(name));
  }
  const multiline = field instanceof HTMLTextAreaElement;
  mirror.style.position = "fixed";
  mirror.style.visibility = "hidden";
  mirror.style.top = "0";
  mirror.style.left = "0";
  mirror.style.overflow = "hidden";
  mirror.style.whiteSpace = multiline ? "pre-wrap" : "pre";
  mirror.style.overflowWrap = multiline ? "break-word" : "normal";
  mirror.textContent = field.value.slice(0, index);
  const marker = document.createElement("span");
  // 空の span は高さを持たないので、幅の無い文字を入れる。
  marker.textContent = "\u200b";
  mirror.append(marker);
  document.body.append(mirror);
  const markerRect = marker.getBoundingClientRect();
  const mirrorRect = mirror.getBoundingClientRect();
  mirror.remove();
  return {
    left: markerRect.left - mirrorRect.left,
    top: markerRect.top - mirrorRect.top,
    height: markerRect.height,
  };
};

/** `caretOffset` で測った位置が、今の画面のどこにあるか。欄の送りと画面の送りを当てる。 */
export const caretRect = (field: Field, offset: CaretOffset): DOMRect => {
  const box = field.getBoundingClientRect();
  return new DOMRect(
    box.left + offset.left - field.scrollLeft,
    box.top + offset.top - field.scrollTop,
    0,
    offset.height,
  );
};
