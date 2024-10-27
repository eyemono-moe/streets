import { createEffect, createSignal, onCleanup } from "solid-js";

const topMargin = 10;

/**
 * スクロールをトップに戻すためのフック
 * - `setTarget`: スクロールを監視する要素を設定する関数
 * - `scrollToTop`: 設定された要素をトップにスクロールする関数
 * - `isTop`: 設定された要素がトップにスクロールされているかどうかの状態
 */
export const useScrollToTop = () => {
  const [target, setTarget] = createSignal<HTMLElement>();
  const [isTop, setIsTop] = createSignal(true);

  const scrollToTop = () => {
    const targetElement = target();
    if (targetElement) {
      targetElement.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  let ticking = false;
  const handleScroll = () => {
    if (!ticking) {
      window.requestAnimationFrame(() => {
        setIsTop((target()?.scrollTop ?? topMargin) < topMargin);
        ticking = false;
      });
      ticking = true;
    }
  };

  createEffect<HTMLElement | undefined>((prev) => {
    const targetElement = target();
    if (targetElement) {
      if (prev) {
        prev.removeEventListener("scroll", handleScroll);
      }
      targetElement.addEventListener("scroll", handleScroll, { passive: true });
      handleScroll();
      return targetElement;
    }
  });

  onCleanup(() => {
    const targetElement = target();
    targetElement?.removeEventListener("scroll", handleScroll);
  });

  return { setTarget, scrollToTop, isTop };
};
