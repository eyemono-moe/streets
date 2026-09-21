import { createVirtualizer } from "@tanstack/solid-virtual";
import {
  For,
  type JSX,
  Show,
  createEffect,
  onCleanup,
  onMount,
} from "solid-js";

export type VirtualListProps<T> = {
  items: readonly T[];
  itemKey: (item: T) => string;
  children: (item: T) => JSX.Element;
  /** 実測前に使う行高。大きく外れても、表示後は ResizeObserver で補正される。 */
  estimateSize?: number;
  class?: string;
};

/**
 * 親のスクロール領域に対して、見えている行とその前後だけを DOM に置く。
 * 行高は固定せず `measureElement` で測るため、長文や画像を含む投稿にも使える。
 */
const VirtualList = <T,>(props: VirtualListProps<T>): JSX.Element => {
  let root: HTMLDivElement | undefined;
  let followsStart = true;
  let firstKey: string | undefined;
  const scrollElement = () =>
    (root?.closest("[data-scroll-container]") as HTMLDivElement | null) ??
    (root?.parentElement as HTMLDivElement | null);
  const virtualizer = createVirtualizer<HTMLDivElement, HTMLDivElement>({
    get count() {
      return props.items.length;
    },
    getScrollElement: scrollElement,
    estimateSize: () => props.estimateSize ?? 180,
    getItemKey: (index) => {
      const item = props.items[index];
      return item === undefined ? index : props.itemKey(item);
    },
    get scrollMargin() {
      const scroller = scrollElement();
      if (!root || !scroller) return 0;
      return (
        root.getBoundingClientRect().top -
        scroller.getBoundingClientRect().top +
        scroller.scrollTop
      );
    },
    // 先頭への追加で既存の投稿が後ろへずれても、表示中の投稿を同じ位置に保つ。
    anchorTo: "end",
    overscan: 5,
  });

  onMount(() => {
    const scroller = scrollElement();
    if (!scroller) return;
    const updateFollowsStart = () => {
      followsStart = scroller.scrollTop <= 1;
    };
    updateFollowsStart();
    scroller.addEventListener("scroll", updateFollowsStart, { passive: true });
    onCleanup(() => scroller.removeEventListener("scroll", updateFollowsStart));
  });

  createEffect(() => {
    const first = props.items[0];
    const nextKey = first === undefined ? undefined : props.itemKey(first);
    const shouldFollow =
      firstKey !== undefined && nextKey !== firstKey && followsStart;
    firstKey = nextKey;
    if (shouldFollow) {
      // anchorTo は既存行を安定させるため常に有効にし、一覧先頭にいた場合だけ
      // その補正後にカラム全体の先頭へ追従する。virtualizer の offset 0 は
      // scrollMargin の後ろなので、一覧より上に内容があるとそこまで隠してしまう。
      queueMicrotask(() => scrollElement()?.scrollTo({ top: 0 }));
    }
  });

  return (
    <div
      ref={root}
      class={`relative w-full ${props.class ?? ""}`}
      style={{ height: `${virtualizer.getTotalSize()}px` }}
    >
      <For each={virtualizer.getVirtualItems()}>
        {(virtualRow) => {
          const item = () => props.items[virtualRow.index];
          return (
            // Solid adapter は仮想行を index で再利用する。イベントが入れ替わった
            // ときだけ実DOMを作り直し、TanStackに新しい key として実測させる。
            <Show when={item()} keyed>
              {(current) => (
                <div
                  data-index={virtualRow.index}
                  ref={(element) =>
                    queueMicrotask(() => {
                      if (element.isConnected) {
                        virtualizer.measureElement(element);
                      }
                    })
                  }
                  class="absolute top-0 left-0 w-full"
                  style={{
                    transform: `translateY(${virtualRow.start - virtualizer.options.scrollMargin}px)`,
                  }}
                >
                  {props.children(current)}
                </div>
              )}
            </Show>
          );
        }}
      </For>
    </div>
  );
};

export default VirtualList;
