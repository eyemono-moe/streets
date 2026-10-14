import {
  menuProgress,
  menuSwipeIntent,
  settleMenu,
} from "@streets/core/deck/menu-swipe";

/** 左から出るメニューの幅。狭い端末では、後ろのカラムを少し見せて閉じられると分かるようにする。 */
export const menuWidth = (view: Window): number =>
  Math.min(300, view.innerWidth * 0.85);

/**
 * 指でメニューを引き出す・押し戻すのを追う。`toward` は動かす向き（右なら開く、左なら閉じる）。
 * 外す関数を返す。
 *
 * Solid の `onTouchMove` は使わない。document に置かれる受け口は passive になり、
 * メニューを動かしている間の縦のスクロールを止められない。
 */
export const trackMenuDrag = (
  el: HTMLElement,
  options: {
    toward: "left" | "right";
    /** 指を置いたときに、この払い方として追うか。 */
    accepts: (event: TouchEvent) => boolean;
    /** メニューの出ている割合（0〜1）が変わった。 */
    move: (progress: number) => void;
    /** 指を離した。開いたままにするか。 */
    end: (open: boolean, progress: number) => void;
  },
): (() => void) => {
  const base = options.toward === "right" ? 0 : 1;
  let state: "idle" | "pending" | "menu" = "idle";
  let start = { x: 0, y: 0 };
  let last = { x: 0, t: 0 };
  let velocity = 0;
  let progress = base;

  const width = () => menuWidth(el.ownerDocument.defaultView ?? window);

  const onStart = (event: TouchEvent) => {
    const touch = event.touches[0];
    if (event.touches.length !== 1 || !touch || !options.accepts(event)) {
      state = "idle";
      return;
    }
    state = "pending";
    start = { x: touch.clientX, y: touch.clientY };
    last = { x: touch.clientX, t: event.timeStamp };
    velocity = 0;
    progress = base;
  };
  const onMove = (event: TouchEvent) => {
    const touch = event.touches[0];
    if (state === "idle" || !touch) return;
    const point = { x: touch.clientX, y: touch.clientY };
    if (state === "pending") {
      const intent = menuSwipeIntent(start, point, options.toward);
      if (intent === "pending") return;
      if (intent === "other") {
        state = "idle";
        return;
      }
      state = "menu";
    }
    if (event.cancelable) event.preventDefault();
    const w = width();
    progress = menuProgress(base * w + point.x - start.x, w);
    const dt = event.timeStamp - last.t;
    if (dt > 0) {
      // 離す直前の向きを見たいので、古い速さはすぐ薄める。
      velocity = velocity * 0.2 + ((point.x - last.x) / dt) * 0.8;
    }
    last = { x: point.x, t: event.timeStamp };
    options.move(progress);
  };
  const onEnd = (event: TouchEvent) => {
    if (state === "menu") {
      // 途中で取り上げられた（着信など）ときは、触る前の状態へ戻す。
      const open =
        event.type === "touchcancel"
          ? base === 1
          : settleMenu(progress, velocity);
      options.end(open, progress);
    }
    state = "idle";
  };

  el.addEventListener("touchstart", onStart, { passive: true });
  el.addEventListener("touchmove", onMove, { passive: false });
  el.addEventListener("touchend", onEnd, { passive: true });
  el.addEventListener("touchcancel", onEnd, { passive: true });
  return () => {
    el.removeEventListener("touchstart", onStart);
    el.removeEventListener("touchmove", onMove);
    el.removeEventListener("touchend", onEnd);
    el.removeEventListener("touchcancel", onEnd);
  };
};

/**
 * 指を置いた場所から帯までの間に、左へ戻せる横のスクロール（横に長い表、タブの帯など）が
 * あるか。あれば、右へ払った指はそちらを送るのに使う。
 */
export const scrollsBackFrom = (
  target: EventTarget | null,
  root: HTMLElement,
): boolean => {
  let el = target instanceof Element ? target : null;
  while (el && el !== root) {
    if (el.scrollLeft > 0 && el.scrollWidth > el.clientWidth) {
      const overflow = getComputedStyle(el).overflowX;
      if (overflow === "auto" || overflow === "scroll") return true;
    }
    el = el.parentElement;
  }
  return false;
};
