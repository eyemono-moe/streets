import { createVirtualizer } from "@tanstack/solid-virtual";
import { For, type JSX } from "solid-js";

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
    overscan: 5,
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
            <div
              data-index={virtualRow.index}
              ref={(element) =>
                queueMicrotask(() => virtualizer.measureElement(element))
              }
              class="absolute top-0 left-0 w-full"
              style={{
                transform: `translateY(${virtualRow.start - virtualizer.options.scrollMargin}px)`,
              }}
            >
              {item() === undefined ? undefined : props.children(item() as T)}
            </div>
          );
        }}
      </For>
    </div>
  );
};

export default VirtualList;
