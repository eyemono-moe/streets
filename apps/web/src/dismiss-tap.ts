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
 * ポップアップを開いている間の外のタップは、閉じるだけにする。
 *
 * Ark UI（Zag）はタッチのとき、外の押下で閉じるのを click まで待つ。その click は
 * 下にある投稿にも届き、スレッドや画像が開いてしまう。マウスでは押した時点で
 * 閉じるので、ここでは扱わない。
 */
export const swallowTapsThatDismissPopups = () => {
  let swallow = false;
  window.addEventListener(
    "pointerdown",
    (event) => {
      swallow =
        event.pointerType !== "mouse" && isOutsideOpenPopups(event.target);
    },
    true,
  );
  // 指を滑らせてスクロールしたときは click が来ない。次の click まで残さない。
  window.addEventListener("pointercancel", () => (swallow = false), true);
  window.addEventListener(
    "click",
    (event) => {
      if (!swallow) return;
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
