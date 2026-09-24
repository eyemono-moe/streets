import { createVirtualizer } from "@tanstack/solid-virtual";
import {
  For,
  type JSX,
  createEffect,
  createMemo,
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

  /**
   * 表示する中身と、その置き場所。TanStack は「何番目か」で行を返すが、行を
   * 番号で作り直すと、先頭に 1 件入っただけで全部の行が作り直される —— 開いて
   * いたメニューやダイアログが消えてしまう。中身ごとに行を持ち、位置だけを
   * 動かす。
   */
  const placements = createMemo(() => {
    const map = new Map<string, { index: number; start: number }>();
    for (const row of virtualizer.getVirtualItems()) {
      const item = props.items[row.index];
      if (item === undefined) continue;
      map.set(props.itemKey(item), { index: row.index, start: row.start });
    }
    return map;
  });
  const visible = createMemo(() => {
    const items: T[] = [];
    for (const row of virtualizer.getVirtualItems()) {
      const item = props.items[row.index];
      if (item !== undefined) items.push(item);
    }
    return items;
  });

  return (
    <div
      ref={root}
      class={`relative w-full ${props.class ?? ""}`}
      style={{ height: `${virtualizer.getTotalSize()}px` }}
    >
      <For each={visible()}>
        {(item) => {
          const placement = () => placements().get(props.itemKey(item));
          let element: HTMLDivElement | undefined;
          // 番号が変わったら測り直させる。TanStack は data-index で行を見分ける。
          // ここで測ると、先頭への追従（下の scrollTo）より先に高さが確定する。
          createEffect(() => {
            if (placement()?.index === undefined) return;
            if (element?.isConnected) virtualizer.measureElement(element);
          });
          return (
            <div
              ref={element}
              data-virtual-row
              data-index={placement()?.index}
              class="absolute top-0 left-0 w-full"
              style={{
                transform: `translateY(${(placement()?.start ?? 0) - virtualizer.options.scrollMargin}px)`,
              }}
            >
              {props.children(item)}
            </div>
          );
        }}
      </For>
    </div>
  );
};

export default VirtualList;
