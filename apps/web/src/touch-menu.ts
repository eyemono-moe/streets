/**
 * `data-no-touch-menu` を付けた画像（アイコン・絵文字）は、指の長押しで画像の
 * 保存メニューを出さない。カラムを指で送るときに触れやすく、保存したい人もまずいない。
 *
 * iOS Safari は長押しで `contextmenu` を出さないので preflight の CSS
 * （`-webkit-touch-callout: none`）で止め、Android はここで `contextmenu` を止める。
 * マウスの右クリックは止めない。
 */
export const blockTouchMenusOnMarkedImages = () => {
  // contextmenu が PointerEvent かどうかはブラウザで揃わないので、直前の押下で決める。
  let touched = false;
  window.addEventListener(
    "pointerdown",
    (event) => (touched = event.pointerType !== "mouse"),
    true,
  );
  window.addEventListener(
    "contextmenu",
    (event) => {
      if (
        touched &&
        event.target instanceof Element &&
        event.target.closest("[data-no-touch-menu]")
      )
        event.preventDefault();
    },
    true,
  );
};
