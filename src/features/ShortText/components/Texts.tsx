import { createViewportObserver } from "@solid-primitives/intersection-observer";
import type { Filter } from "nostr-tools";
import { type Component, For, Match, Show, Switch } from "solid-js";
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

  // @ts-ignore TS6133: ts can't detect functions used in directives
  const [intersectionObserver] = createViewportObserver();

  return (
    <div class="h-full divide-y">
      <For each={sortEvents(texts.data ?? [])}>
        {(text) => <TextOrRepost textOrRepost={text} />}
      </For>
      <Show
        when={oldTexts.status !== "pending"}
        // when={false}
        fallback={
          <div class="grid h-full w-full place-items-center">
            <div class="b-4 b-zinc-3 b-r-violet aspect-square h-auto w-8 animate-spin rounded-full" />
          </div>
        }
      >
        <For each={oldTexts.data?.pages}>
          {(page) => (
            <For each={sortEvents(page)}>
              {(text) => <TextOrRepost textOrRepost={text} />}
            </For>
          )}
        </For>
        <button
          class="flex w-full items-center justify-center p-2"
          type="button"
          onClick={() => oldTexts.fetchNextPage()}
          use:intersectionObserver={(e) => {
            oldTexts.fetchNextPage();
          }}
          disabled={!oldTexts.hasNextPage || oldTexts.isFetchingNextPage}
        >
          <Switch fallback="Load more...">
            <Match when={oldTexts.isFetchingNextPage}>
              <div>
                <div class="b-4 b-zinc-3 b-r-violet aspect-square h-auto w-8 animate-spin rounded-full" />
              </div>
            </Match>
            <Match when={!oldTexts.hasNextPage}>Nothing to load</Match>
          </Switch>
        </button>
      </Show>
    </div>
  );
};

export default Texts;
