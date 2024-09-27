import { createViewportObserver } from "@solid-primitives/intersection-observer";
import { type Component, For, Show, createSignal } from "solid-js";
import { pickLatestEvent, sortEvents } from "../../../libs/latestEvent";
import { useQueryPubKey } from "../../../libs/useNIP07";
import {
  useQueryFollowList,
  useQueryInfiniteTextOrRepost,
  useQueryLatestTextOrRepost,
} from "../query";
import TextOrRepost from "./TextOrRepost";

const Texts: Component = () => {
  const pubKey = useQueryPubKey();
  const follows = useQueryFollowList(() => pubKey.data);
  const followPubKeys = () =>
    pickLatestEvent(follows.data ?? [])?.tags.map((tag) => tag.pubkey);

  const texts = useQueryLatestTextOrRepost(followPubKeys);
  const oldTexts = useQueryInfiniteTextOrRepost(followPubKeys);

  const [intersectionObserver] = createViewportObserver();

  const [canFetch, setCanFetch] = createSignal(true);
  const fetchNextPage = () => {
    if (!canFetch()) return;
    oldTexts.fetchNextPage();
    setCanFetch(false);
    setTimeout(() => setCanFetch(true), 1000);
  };

  return (
    <div class="divide-y">
      <For each={sortEvents(texts.data ?? [])}>
        {(text) => <TextOrRepost textOrRepost={text} />}
      </For>
      <For each={oldTexts.data?.pages}>
        {(page) => (
          <For each={sortEvents(page)}>
            {(text) => <TextOrRepost textOrRepost={text} />}
          </For>
        )}
      </For>
      <div
        use:intersectionObserver={() => {
          fetchNextPage();
        }}
      >
        <Show when={oldTexts.isFetching}>
          <div class="flex items-center justify-center p-2">
            <div class="animate-spin rounded-full w-8 h-auto aspect-square b-4 b-zinc-3 b-r-violet" />
          </div>
        </Show>
      </div>
    </div>
  );
};

export default Texts;
