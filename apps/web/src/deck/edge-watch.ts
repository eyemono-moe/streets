import { createEffect, on, onCleanup, onMount } from "solid-js";

/**
 * 一覧の端に置いた `sentinel` が、カラムのスクロール領域の端から `margin` の内に
 * 入っていたら `onReach` を呼ぶ。`idle` が真の間だけ、見張りをかけ直す。
 *
 * IntersectionObserver は交わりが変わったときしか知らせない。取り足しても端がまだ
 * 近いときや、持つ件数の上限で反対側を捨てて `idle` のまま一覧が縮んだときは通知が
 * 来ず、端に着いたまま止まる。`idle` に戻ったときと、一覧の高さが変わったときに
 * 見張り直して、今の交わりをもう一度受け取る。
 */
export const watchEdge = (options: {
  sentinel: () => HTMLElement | undefined;
  margin: () => string;
  idle: () => boolean;
  onReach: () => void;
}) => {
  let observer: IntersectionObserver | undefined;
  const rearm = () => {
    const sentinel = options.sentinel();
    if (!sentinel || !observer || !options.idle()) return;
    observer.unobserve(sentinel);
    observer.observe(sentinel);
  };

  onMount(() => {
    const sentinel = options.sentinel();
    if (!sentinel) return;
    observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) options.onReach();
      },
      {
        // カラムの中でスクロールするので、その箱を基準にする。
        root: sentinel.closest<HTMLElement>(".overflow-y-auto"),
        rootMargin: options.margin(),
      },
    );
    observer.observe(sentinel);
    const list = sentinel.parentElement;
    const resize = list ? new ResizeObserver(rearm) : undefined;
    if (list) resize?.observe(list);
    onCleanup(() => {
      observer?.disconnect();
      resize?.disconnect();
    });
  });

  createEffect(on(options.idle, (idle) => idle && rearm(), { defer: true }));
};
