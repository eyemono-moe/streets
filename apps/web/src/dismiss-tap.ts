/**
 * 外を押すと閉じるポップアップ。外の押下を素通しするもの（入力補完の一覧など）は
 * `data-outside-taps="pass"` を付けて外す。
 */
const OPEN_POPUP = [
  '[data-scope="menu"][data-part="content"][data-state="open"]',
  '[data-scope="popover"][data-part="content"][data-state="open"]:not([data-outside-taps="pass"])',
].join(",");

/** 開いているポップアップの開き口。押せば開き口として閉じるので、飲み込まない。 */
const OPEN_TRIGGER =
  '[data-scope="menu"][data-part="trigger"][data-state="open"],[data-scope="popover"][data-part="trigger"][data-state="open"]';

const isOutsideOpenPopups = (target: EventTarget | null): boolean => {
  if (!(target instanceof Element)) return false;
  const popups = document.querySelectorAll(OPEN_POPUP);
  if (popups.length === 0) return false;
  if (target.closest(OPEN_TRIGGER)) return false;
  return [...popups].every((popup) => !popup.contains(target));
};

/**
 * ポップアップを開いている間の外の押下（タップ・クリック）は、閉じるだけにする。
 *
 * Ark UI（Zag）は外の押下で閉じても、続く click は下にある投稿に届き、スレッドや
 * 画像が開いてしまう。閉じたかどうかは押した時点でしか分からない（マウスでは
 * 押した時点で閉じる）ので、押下で決めて click で止める。
 */
export const swallowPressesThatDismissPopups = () => {
  let swallow = false;
  window.addEventListener(
    "pointerdown",
    (event) => {
      // 右クリックなどは click を生まず、印だけが残る。
      swallow = event.button === 0 && isOutsideOpenPopups(event.target);
    },
    true,
  );
  // 指を滑らせてスクロールしたときは click が来ない。次の click まで残さない。
  window.addEventListener("pointercancel", () => (swallow = false), true);
  window.addEventListener(
    "click",
    (event) => {
      // キーボードで押した click（detail が 0）は押下と組にならないので止めない。
      if (!swallow || event.detail === 0) return;
      swallow = false;
      event.preventDefault();
      event.stopPropagation();
      // Zag が閉じるのに使う document の click は、止めた click の代わりにここで渡す。
      // 外かどうかは押下の位置で判断されるので、この click の宛先は何でもよい。
      document.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    },
    true,
  );
};
