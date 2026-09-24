import type { Paging } from "@streets/core/read/source";
import {
  type Component,
  Match,
  Switch,
  createEffect,
  on,
  onCleanup,
  onMount,
} from "solid-js";

/** 下端のどれくらい手前で次を取りに行くか。1 画面ぶんほど先に取り始める。 */
const AHEAD_PX = 800;

/**
 * 一覧の下端に置く。近づいたら古い投稿を 1 ページぶん取り足させ、取っている間と
 * もう無いときを知らせる。
 */
const OlderLoader: Component<{
  paging: Paging;
  onReach: () => void;
}> = (props) => {
  let sentinel: HTMLDivElement | undefined;
  let observer: IntersectionObserver | undefined;

  onMount(() => {
    if (!sentinel) return;
    observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) props.onReach();
      },
      {
        // カラムの中でスクロールするので、その箱を基準にする。
        root: sentinel.closest<HTMLElement>(".overflow-y-auto"),
        rootMargin: `0px 0px ${AHEAD_PX}px 0px`,
      },
    );
    observer.observe(sentinel);
    onCleanup(() => observer?.disconnect());
  });

  // 取り足しても下端がまだ見えている（1 ページが短い）ときや、最初のページが揃った
  // ときは、交わりが変わらないので通知が来ない。見張り直して、今の状態をもう一度受け取る。
  createEffect(
    on(
      () => props.paging,
      (paging) => {
        if (paging !== "idle" || !sentinel || !observer) return;
        observer.unobserve(sentinel);
        observer.observe(sentinel);
      },
      { defer: true },
    ),
  );

  return (
    <div ref={sentinel} class="c-secondary p-4 text-center text-caption">
      <Switch>
        <Match when={props.paging === "loading"}>古い投稿を読み込み中…</Match>
        <Match when={props.paging === "exhausted"}>
          これより前の投稿はありません
        </Match>
      </Switch>
    </div>
  );
};

export default OlderLoader;
