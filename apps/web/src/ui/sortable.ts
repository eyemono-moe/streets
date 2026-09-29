import { dropIndex, type SortSlot } from "@streets/core/deck/sortable";
import { onCleanup } from "solid-js";

type SortableOptions = {
  /** 並ぶ向き。 */
  axis: "x" | "y";
  /**
   * 並ぶものの offsetParent。位置（`relative` など）を持たせる。並ぶものの位置は
   * この箱の中の位置で測る —— 見た目の位置は、動いている途中の transform を含んでしまう。
   */
  container: () => HTMLElement | undefined;
  /** 端へ寄せたら送る箱。`container` と同じでもよい。 */
  scroller: () => HTMLElement | undefined;
  element: (id: string) => HTMLElement | undefined;
  /** いま見せている並び。掴んだものは、離したら入る位置にある。 */
  order: () => readonly string[];
  start: (id: string, index: number) => void;
  move: (to: number) => void;
  drop: () => void;
  cancel: () => void;
};

/** これだけ動かすまでは掴まない。押しただけ（題名を押して先頭へ戻る、など）と分ける。 */
const SLOP = 4;
/** 送る箱の端からこの幅に入ったら、箱を送る。 */
const EDGE = 56;
/** 端に寄せきったときに 1 フレームで送る量。 */
const EDGE_SPEED = 18;
const SHIFT_MS = 160;
const EASING = "cubic-bezier(0.2, 0, 0, 1)";

type Session = {
  id: string;
  pointerId: number;
  down: { x: number; y: number };
  client: { x: number; y: number };
  active: boolean;
  /** 掴んだものの頭から、掴んだ位置まで。 */
  grab: number;
  frame: number;
  /** 長押しで掴むときの、掴むまでの timer。 */
  hold: ReturnType<typeof setTimeout> | undefined;
};

/**
 * ポインタで掴んで並べ替える。掴んだものはポインタに付いて動き、ほかは離したら
 * 入る位置へ滑って空ける。並びは `order` を見せる側が持ち、ここは位置を測って
 * `start`・`move`・`drop`・`cancel` を呼ぶだけ。Esc で掴む前に戻す。
 *
 * HTML の drag and drop は使わない。タッチでは動かず、掴んだものの見た目も選べない。
 */
export const createSortable = (options: SortableOptions) => {
  const x = options.axis === "x";
  let session: Session | undefined;
  const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

  const slotStart = (el: HTMLElement) => (x ? el.offsetLeft : el.offsetTop);
  const visualStart = (el: HTMLElement) => {
    const rect = el.getBoundingClientRect();
    return x ? rect.left : rect.top;
  };
  const pointerAt = (client: { x: number; y: number }) => {
    const container = options.container();
    if (!container) return 0;
    const rect = container.getBoundingClientRect();
    return x
      ? client.x - rect.left - container.clientLeft + container.scrollLeft
      : client.y - rect.top - container.clientTop + container.scrollTop;
  };
  const slots = (): SortSlot[] =>
    options.order().flatMap((id) => {
      const el = options.element(id);
      if (!el) return [];
      return [
        {
          id,
          start: slotStart(el),
          size: x ? el.offsetWidth : el.offsetHeight,
        },
      ];
    });
  const translate = (distance: number) =>
    x ? `translateX(${distance}px)` : `translateY(${distance}px)`;

  // 並びを変え、変わる前の見た目の位置から今の位置へ滑らせる。途中で動いているものは、
  // 動いている途中の見た目から続ける。
  const animated = new WeakMap<HTMLElement, Animation>();
  const shift = (ids: readonly string[], apply: () => void) => {
    const before = new Map<string, number>();
    for (const id of ids) {
      const el = options.element(id);
      if (el) before.set(id, visualStart(el));
    }
    apply();
    for (const id of ids) {
      const el = options.element(id);
      const from = before.get(id);
      if (!el || from === undefined) continue;
      animated.get(el)?.cancel();
      animated.delete(el);
      const distance = from - visualStart(el);
      if (distance === 0 || reduced()) continue;
      animated.set(
        el,
        el.animate(
          [{ transform: translate(distance) }, { transform: "none" }],
          { duration: SHIFT_MS, easing: EASING },
        ),
      );
    }
  };

  // 掴んだものを、ポインタの位置へ置く。並びの中の位置は `order` で変わるので、毎回測る。
  const place = (current: Session) => {
    const el = options.element(current.id);
    if (!el) return;
    const offset = pointerAt(current.client) - current.grab - slotStart(el);
    el.style.transform = translate(offset);
  };

  const update = (current: Session) => {
    const to = dropIndex(slots(), current.id, pointerAt(current.client));
    if (to !== options.order().indexOf(current.id)) {
      shift(
        options.order().filter((id) => id !== current.id),
        () => options.move(to),
      );
    }
    place(current);
  };

  const edgeScroll = () => {
    const current = session;
    if (!current?.active) return;
    const scroller = options.scroller();
    if (scroller) {
      const rect = scroller.getBoundingClientRect();
      const at = x ? current.client.x : current.client.y;
      const head = x ? rect.left : rect.top;
      const tail = x ? rect.right : rect.bottom;
      const speed =
        at < head + EDGE
          ? -EDGE_SPEED * Math.min(1, (head + EDGE - at) / EDGE)
          : at > tail - EDGE
            ? EDGE_SPEED * Math.min(1, (at - (tail - EDGE)) / EDGE)
            : 0;
      if (speed !== 0) {
        scroller.scrollBy(x ? { left: speed } : { top: speed });
        update(current);
      }
    }
    current.frame = requestAnimationFrame(edgeScroll);
  };

  let restoreBody: (() => void) | undefined;
  const activate = (current: Session) => {
    const el = options.element(current.id);
    const index = options.order().indexOf(current.id);
    if (!el || index < 0) {
      finish();
      return;
    }
    current.active = true;
    current.grab = pointerAt(current.client) - slotStart(el);
    el.dataset.dragging = "";
    const { userSelect, cursor } = document.body.style;
    document.body.style.userSelect = "none";
    document.body.style.cursor = "grabbing";
    restoreBody = () => {
      document.body.style.userSelect = userSelect;
      document.body.style.cursor = cursor;
    };
    getSelection()?.removeAllRanges();
    options.start(current.id, index);
    current.frame = requestAnimationFrame(edgeScroll);
  };

  // 離した・やめた。掴んでいたものは、ポインタの位置から並びの中の位置へ戻す。
  const settle = (current: Session, apply: () => void) => {
    const el = options.element(current.id);
    shift(options.order(), () => {
      if (el) el.style.transform = "";
      apply();
    });
    if (!el) return;
    const running = animated.get(el);
    if (running) {
      running.onfinish = () => delete el.dataset.dragging;
      running.oncancel = running.onfinish;
    } else {
      delete el.dataset.dragging;
    }
  };

  const onMove = (event: PointerEvent) => {
    const current = session;
    if (!current || event.pointerId !== current.pointerId) return;
    current.client = { x: event.clientX, y: event.clientY };
    if (!current.active) {
      const moved = Math.hypot(
        current.client.x - current.down.x,
        current.client.y - current.down.y,
      );
      if (moved <= SLOP) return;
      // 長押しで掴むものは、押している間に動いたら一覧を送るつもり。ブラウザに任せる。
      if (current.hold !== undefined) {
        finish();
        return;
      }
      activate(current);
      if (!current.active) return;
    }
    event.preventDefault();
    update(current);
  };

  const onUp = (event: PointerEvent) => {
    const current = session;
    if (!current || event.pointerId !== current.pointerId) return;
    if (current.active) {
      // 離した位置の要素に click が届くと、題名を押した扱い（先頭へ戻る）になる。
      const swallow = (click: MouseEvent) => {
        click.stopPropagation();
        click.preventDefault();
      };
      window.addEventListener("click", swallow, { capture: true, once: true });
      setTimeout(() =>
        window.removeEventListener("click", swallow, { capture: true }),
      );
      settle(current, options.drop);
    }
    finish();
  };

  const abort = () => {
    const current = session;
    if (!current) return;
    if (current.active) settle(current, options.cancel);
    finish();
  };
  const onCancel = (event: PointerEvent) => {
    if (event.pointerId === session?.pointerId) abort();
  };
  const onKey = (event: KeyboardEvent) => {
    if (event.key !== "Escape" || !session?.active) return;
    // パネルやダイアログが Esc で閉じないよう、ここで止める。
    event.preventDefault();
    event.stopPropagation();
    abort();
  };
  // 長押しで掴んだ後は、指を動かしてもページを送らせない。touch-action は押した
  // 時点で決まるので、掴んでから止めるには touchmove を止めるしかない。
  const onTouchMove = (event: TouchEvent) => {
    if (session?.active) event.preventDefault();
  };
  // 長押しで出る端末のメニュー（コピーなど）を出さない。
  const onContextMenu = (event: Event) => {
    if (session) event.preventDefault();
  };
  // 掴んだ中の画像やリンクを、ブラウザがドラッグし始めると pointer が奪われる。
  const onNativeDrag = (event: DragEvent) => event.preventDefault();

  const finish = () => {
    if (session) {
      cancelAnimationFrame(session.frame);
      clearTimeout(session.hold);
    }
    session = undefined;
    restoreBody?.();
    restoreBody = undefined;
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    window.removeEventListener("pointercancel", onCancel);
    window.removeEventListener("keydown", onKey, { capture: true });
    window.removeEventListener("dragstart", onNativeDrag, { capture: true });
    window.removeEventListener("touchmove", onTouchMove);
    window.removeEventListener("contextmenu", onContextMenu, { capture: true });
  };
  onCleanup(abort);

  return {
    /**
     * 掴める場所で押された。動かし始めるまでは何もしない。`hold` を渡すと、その間
     * 動かさずに押し続けたら掴む（タッチで、押した場所を送る操作にも使うとき）。
     */
    onPointerDown: (
      id: string,
      event: PointerEvent,
      options?: { hold?: number },
    ) => {
      if (session || !event.isPrimary || event.button !== 0) return;
      const client = { x: event.clientX, y: event.clientY };
      const current: Session = {
        id,
        pointerId: event.pointerId,
        down: client,
        client,
        active: false,
        grab: 0,
        frame: 0,
        hold: undefined,
      };
      session = current;
      if (options?.hold !== undefined) {
        current.hold = setTimeout(() => {
          current.hold = undefined;
          if (session !== current) return;
          activate(current);
          // 掴んだことを、指の下で分かるようにする（対応する端末だけ）。
          if ("vibrate" in navigator) navigator.vibrate(10);
        }, options.hold);
      }
      window.addEventListener("touchmove", onTouchMove, { passive: false });
      window.addEventListener("contextmenu", onContextMenu, { capture: true });
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onCancel);
      window.addEventListener("keydown", onKey, { capture: true });
      window.addEventListener("dragstart", onNativeDrag, { capture: true });
    },
  };
};
