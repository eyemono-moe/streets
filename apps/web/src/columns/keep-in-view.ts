import { onCleanup } from "solid-js";

/** 上に見せておく、前の投稿の下の端。上にまだ続きがあると分かる程度。 */
const PEEK_PX = 40;

const scrollParent = (element: HTMLElement): HTMLElement | undefined => {
  for (let node = element.parentElement; node; node = node.parentElement) {
    const { overflowY } = getComputedStyle(node);
    if (overflowY === "auto" || overflowY === "scroll") return node;
  }
  return undefined;
};

/**
 * `target` が上から `PEEK_PX` の位置に来るように、スクロール領域を送る。`watch` の
 * 高さが変わる（上に投稿が届いて押し下げられる）たびに置き直し、使う人が自分で
 * スクロールし始めたらやめる。`scrollIntoView` は使わない —— デッキの横の並びまで
 * 動かしてしまう。
 */
export const keepInView = (
  target: HTMLElement,
  watch: () => HTMLElement | undefined,
): void => {
  let stop = () => {};
  // `ref` は要素が DOM に入る前に呼ばれるので、置かれてから始める。
  const frame = requestAnimationFrame(() => {
    const scroller = scrollParent(target);
    const watched = watch();
    if (!scroller || !watched) return;
    const place = () => {
      const offset =
        target.getBoundingClientRect().top -
        scroller.getBoundingClientRect().top;
      scroller.scrollTop += offset - PEEK_PX;
    };
    const observer = new ResizeObserver(place);
    const inputs = ["wheel", "touchstart", "pointerdown", "keydown"] as const;
    stop = () => {
      observer.disconnect();
      for (const name of inputs) scroller.removeEventListener(name, stop);
    };
    for (const name of inputs) {
      scroller.addEventListener(name, stop, { passive: true });
    }
    observer.observe(watched);
    place();
  });
  onCleanup(() => {
    cancelAnimationFrame(frame);
    stop();
  });
};
