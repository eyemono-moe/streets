import { createViewportObserver } from "@solid-primitives/intersection-observer";
import {
  type Component,
  For,
  Show,
  createEffect,
  createSignal,
} from "solid-js";
import { sortEvents } from "../../../libs/latestEvent";
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
  const followPubKeys = () => follows.data?.tags.map((tag) => tag.pubkey);

  const texts = useQueryLatestTextOrRepost(followPubKeys);
  const oldTexts = useQueryInfiniteTextOrRepost(followPubKeys);

  // @ts-ignore TS6133: ts can't detect functions used in directives
  const [intersectionObserver] = createViewportObserver();

  const [intersecting, setIntersecting] = createSignal(false);
  const [fetchTimeout, setFetchTimeout] = createSignal(true);
  const canFetch = () => fetchTimeout() && !texts.isFetching;

  const fetchNextPage = async () => {
    if (!canFetch()) return;
    await oldTexts.fetchNextPage();
    setFetchTimeout(false);
    setTimeout(() => setFetchTimeout(true), 1000);
  };

  createEffect(() => {
    if (canFetch() && intersecting()) fetchNextPage();
  });

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
        use:intersectionObserver={(e) => {
          setIntersecting(e.isIntersecting);
          fetchNextPage();
        }}
      >
        <Show when={fetchTimeout() || texts.isFetching}>
          <div class="flex items-center justify-center p-2">
            <div class="animate-spin rounded-full w-8 h-auto aspect-square b-4 b-zinc-3 b-r-violet" />
          </div>
        </Show>
      </div>
    </div>
  );
};

export default Texts;
