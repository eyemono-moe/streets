import { createVirtualizer } from "@tanstack/solid-virtual";
import type { Filter } from "nostr-tools";
import {
  type Component,
  For,
  Match,
  Show,
  Switch,
  createEffect,
  createMemo,
} from "solid-js";
import { sortEvents } from "../../../libs/latestEvent";
import {
  useQueryInfiniteTextOrRepost,
  useQueryLatestTextOrRepost,
} from "../query";
import TextOrRepost from "./TextOrRepost";

const Texts: Component<{
  filter?: Omit<Filter, "kinds" | "since">;
}> = (props) => {
  const texts = useQueryLatestTextOrRepost(() => props.filter);
  const oldTexts = useQueryInfiniteTextOrRepost(() => props.filter);

  // const [parentRef, setParentRef] = createSignal<HTMLDivElement | null>(null);
  let parentRef: HTMLDivElement | null;

  const allRows = createMemo(() => {
    return sortEvents(texts.data ?? []).concat(
      oldTexts.data?.pages.flat() ?? [],
    );
  });

  const rowVirtualizer = createVirtualizer({
    get count() {
      return oldTexts.hasNextPage ? allRows().length + 1 : allRows().length;
    },
    estimateSize: () => 96,
    getScrollElement: () => parentRef,
    overscan: 5,
  });

  const items = createMemo(() => rowVirtualizer.getVirtualItems());

  createEffect(() => {
    const lastItem = rowVirtualizer.getVirtualItems().at(-1);
    if (!lastItem) return;

    if (
      lastItem.index >= allRows().length - 1 &&
      oldTexts.hasNextPage &&
      !oldTexts.isFetchingNextPage
    ) {
      oldTexts.fetchNextPage();
    }
  });

  return (
    <div class="h-full overflow-auto contain-strict" ref={parentRef}>
      <div
        class="relative w-full"
        style={{
          height: `${rowVirtualizer.getTotalSize()}px`,
        }}
      >
        <div
          class="absolute top-0 left-0 w-full divide-y"
          style={{
            transform: `translateY(${rowVirtualizer.getVirtualItems().at(0)?.start ?? 0}px)`,
          }}
        >
          <For each={rowVirtualizer.getVirtualItems()}>
            {(row) => (
              <div
                data-index={row.index}
                ref={(el) =>
                  queueMicrotask(() => rowVirtualizer.measureElement(el))
                }
              >
                <Show
                  when={row.index > allRows().length - 1} // if loader row
                  fallback={
                    <TextOrRepost textOrRepost={allRows()[row.index]} />
                  }
                >
                  <button
                    class="flex w-full items-center justify-center p-2"
                    type="button"
                    onClick={() => oldTexts.fetchNextPage()}
                    disabled={
                      !oldTexts.hasNextPage || oldTexts.isFetchingNextPage
                    }
                  >
                    <Switch fallback="Load more...">
                      <Match when={oldTexts.isFetchingNextPage}>
                        <div>
                          <div class="b-4 b-zinc-3 b-r-violet aspect-square h-auto w-8 animate-spin rounded-full" />
                        </div>
                      </Match>
                      <Match when={!oldTexts.hasNextPage}>
                        Nothing to load
                      </Match>
                    </Switch>
                  </button>
                </Show>
              </div>
            )}
          </For>
        </div>
      </div>
    </div>
  );
};

export default Texts;
