import { Drawer } from "@ark-ui/solid/drawer";
import { type ParentComponent, createSignal, onMount } from "solid-js";

/**
 * 覗かせる高さ。取っ手（1rem）と見出し（3.5rem）の合計で、中身を少しも見せない。
 * 後ろのカラムは、この高さだけ下に余白を空けて最後の投稿が隠れないようにする。
 */
export const DRAWER_PEEK = "4.5rem";

const FULL = 1;

/**
 * 狭い画面の入口で、ログインの導線を下から引き上げるシート。閉じさせず、
 * 小さく覗かせた状態と、引き上げた状態の 2 段で止まる。後ろのタイムラインは
 * 覗かせている間も触れる（モーダルにしない）。
 */
const LoginDrawer: ParentComponent<{
  /** 最初から引き上げておく。ストーリーで中身を見せるため。 */
  initialExpanded?: boolean;
}> = (props) => {
  const [snap, setSnap] = createSignal<string | number>(
    props.initialExpanded ? FULL : DRAWER_PEEK,
  );
  const expanded = () => snap() === FULL;
  // 最初から開いた状態で作ると、Drawer（zag-js 1.43）が覗かせる高さを計算せず
  // 全部を出してしまう。閉じた状態で作ってから開き、下からせり上げる。
  const [open, setOpen] = createSignal(false);
  onMount(() => requestAnimationFrame(() => setOpen(true)));
  return (
    <Drawer.Root
      open={open()}
      // 閉じる操作（下へ払う）は、覗かせた状態へ戻すことにする。
      onOpenChange={(details) => {
        if (!details.open) setSnap(DRAWER_PEEK);
      }}
      modal={false}
      trapFocus={false}
      preventScroll={false}
      closeOnInteractOutside={false}
      closeOnEscape={false}
      // ページを開いただけでフォーカスを奪わない。既定では中の最初のボタンへ移る。
      initialFocusEl={() => document.activeElement as HTMLElement | null}
      restoreFocus={false}
      snapPoints={[DRAWER_PEEK, FULL]}
      // 払っても閉じず、覗かせた状態と引き上げた状態の間だけを行き来させる。
      snapToSequentialPoints
      // 既定の「スクロールできる所では動かさない」判定だと、覗かせた状態から
      // 取っ手を上へ引いても動かない。動かす場所は取っ手と見出しに限り、中身は
      // data-no-drag でスクロールに任せる。
      preventDragOnScroll={false}
      snapPoint={snap()}
      onSnapPointChange={(details) => {
        if (details.snapPoint !== null) setSnap(details.snapPoint);
      }}
    >
      <Drawer.Positioner class="pointer-events-none fixed inset-0 isolate">
        <Drawer.Content
          aria-label="ログイン"
          class="pointer-events-auto absolute inset-x-0 bottom-0 flex max-h-[88dvh] flex-col overflow-hidden rounded-t-4 border-primary border-t bg-primary shadow-[0_-10px_30px_rgba(0,0,0,0.18)] outline-none transition-transform duration-180 ease-out data-[dragging]:transition-none dark:shadow-[0_-10px_30px_rgba(0,0,0,0.6)]"
        >
          <Drawer.Grabber class="flex h-4 shrink-0 cursor-grab items-end justify-center">
            <Drawer.GrabberIndicator class="h-1 w-10 rounded-full bg-tertiary" />
          </Drawer.Grabber>
          <button
            type="button"
            class="flex h-14 shrink-0 cursor-pointer items-center justify-between gap-2 bg-transparent px-4 text-left outline-none focus-visible:ring-2 focus-visible:ring-accent-5 focus-visible:ring-inset"
            aria-expanded={expanded()}
            onClick={() => setSnap(expanded() ? DRAWER_PEEK : FULL)}
          >
            <span class="flex items-center gap-2.5">
              <img src="/favicon.svg" alt="" class="size-8" />
              <span class="flex flex-col">
                <span class="font-700 text-body">Streets</span>
                <span class="c-secondary text-caption">
                  {expanded()
                    ? "Nostr のクライアント"
                    : "ログインしてもっと見る"}
                </span>
              </span>
            </span>
            <span
              class="i-material-symbols:expand-less-rounded c-secondary size-6 shrink-0 transition-transform"
              classList={{ "rotate-180": expanded() }}
              aria-hidden="true"
            />
          </button>
          {/* 覗かせている間は中身に触れさせない（見えていない入力欄へ焦点が移らないように）。 */}
          <div
            class="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]"
            inert={!expanded()}
            data-no-drag
          >
            {props.children}
          </div>
        </Drawer.Content>
      </Drawer.Positioner>
    </Drawer.Root>
  );
};

export default LoginDrawer;
