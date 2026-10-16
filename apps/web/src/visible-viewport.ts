import { type Accessor, createSignal, onCleanup } from "solid-js";

/** キーボードに隠れていない、画面の見えている部分。 */
export type VisibleViewport = {
  /** 見えている部分の上端。レイアウトの上端からの距離（px）。 */
  top: number;
  height: number;
};

// アドレスバーの出入りでも見えている高さは数十 px 変わる。キーボードはそれより十分大きい。
const KEYBOARD_MIN_HEIGHT = 120;

/**
 * 画面の下にキーボードが出ている間だけ、見えている部分を返す。
 *
 * iOS Safari と Android Chrome（既定の `interactive-widget=resizes-visual`）は、キーボードが
 * 出ても `position: fixed` の基準（レイアウトの画面）を縮めない。下端に貼った部品はキーボードの
 * 裏に入るので、`visualViewport` から見えている部分を読む。`dvh` もキーボードでは縮まない。
 * viewport の meta で `resizes-content` にすると、アプリ全体がキーボードのたびに縮んで組み直される。
 */
export const createKeyboardViewport = (
  win: Window,
): Accessor<VisibleViewport | undefined> => {
  const [viewport, setViewport] = createSignal<VisibleViewport>();
  const vv = win.visualViewport;
  if (!vv) return viewport;
  const update = () => {
    const layoutHeight = win.document.documentElement.clientHeight;
    const covered = layoutHeight - (vv.offsetTop + vv.height);
    // 拡大している間は、見えている部分が小さいのはキーボードのせいではない。
    const keyboard = vv.scale <= 1.01 && covered >= KEYBOARD_MIN_HEIGHT;
    setViewport(
      keyboard ? { top: vv.offsetTop, height: vv.height } : undefined,
    );
  };
  update();
  vv.addEventListener("resize", update);
  vv.addEventListener("scroll", update);
  onCleanup(() => {
    vv.removeEventListener("resize", update);
    vv.removeEventListener("scroll", update);
  });
  return viewport;
};
