import { type Filter, kinds } from "nostr-tools";
import { createRxForwardReq, now, uniq } from "rx-nostr";
import { map, tap } from "rxjs";
import { type Component, For, Match, Switch, from, onMount } from "solid-js";
import { eventCacheSetter } from "../../../context/eventCache";
import { useRxNostr } from "../../../context/rxNostr";
import { useRxQuery } from "../../../context/rxQuery";
import { type ParsedEventPacket, parseEventPacket } from "../../../libs/parser";
import type { Reaction as TReaction } from "../../../libs/parser/7_reaction";
import {
  cacheAndEmitRelatedEvent,
  createInfiniteRxQuery,
} from "../../../libs/rxQuery";
import { toArrayScan } from "../../../libs/rxjs";
import Reaction from "./Reaction";

const InfiniteReactions: Component<{
  filter: Omit<Filter, "kinds" | "since" | "until">;
}> = (props) => {
  const rxNostr = useRxNostr();
  const latestRxReq = createRxForwardReq();
  const setter = eventCacheSetter();

  const {
    actions: { emit },
  } = useRxQuery();

  const latestPosts = from(
    rxNostr.use(latestRxReq).pipe(
      uniq(),
      tap({
        next: (e) => {
          cacheAndEmitRelatedEvent(e, emit, setter);
        },
      }),
      map((e) => parseEventPacket(e) as ParsedEventPacket<TReaction>),
      toArrayScan(true),
    ),
  );

  onMount(() => {
    latestRxReq.emit({
      ...props.filter,
      since: now,
      kinds: [kinds.Reaction],
    });
  });

  const {
    data: oldPosts,
    fetchNextPage,
    hasNextPage,
    isFetching,
  } = createInfiniteRxQuery(() => ({
    parser: (e) => parseEventPacket(e) as ParsedEventPacket<TReaction>,
    filter: { ...props.filter, kinds: [kinds.Reaction] },
    limit: 20,
  }));

  return (
    <div class="h-full divide-y">
      <For each={latestPosts()}>{(text) => <Reaction reaction={text} />}</For>
      <For each={oldPosts.pages}>
        {(page) => (
          <For each={page}>{(text) => <Reaction reaction={text} />}</For>
        )}
      </For>
      <button
        class="flex w-full items-center justify-center bg-white p-2 enabled:hover:bg-gray-100 disabled:cursor-progress disabled:opacity-50"
        type="button"
        onClick={fetchNextPage}
        disabled={!hasNextPage()}
      >
        <Switch fallback="Load more...">
          <Match when={isFetching()}>
            <div>Loading...</div>
          </Match>
          <Match when={!hasNextPage()}>Nothing to load</Match>
        </Switch>
      </button>
    </div>
  );
};

export default InfiniteReactions;