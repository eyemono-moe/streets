import type { Filter } from "nostr-tools";
import { createRxForwardReq, now, uniq } from "rx-nostr";
import { map, tap } from "rxjs";
import { type Component, For, Match, Switch, from, onMount } from "solid-js";
import { eventCacheSetter } from "../../context/eventCache";
import { useRxNostr } from "../../context/rxNostr";
import { parseEventPacket } from "../libs/parser";
import { cacheAndEmitRelatedEvent, createInfiniteRxQuery } from "../libs/query";
import { toArrayScan } from "../libs/rxjs";
import Event from "./Event";

const InfiniteEvents: Component<{
  filter: Omit<Filter, "since" | "until">;
}> = (props) => {
  const latestRxReq = createRxForwardReq();
  const setter = eventCacheSetter();

  const {
    rxNostr,
    actions: { emit },
  } = useRxNostr();

  const latestEvents = from(
    rxNostr.use(latestRxReq).pipe(
      uniq(),
      tap({
        next: (e) => {
          cacheAndEmitRelatedEvent(e, emit, setter);
        },
      }),
      map((e) => parseEventPacket(e)),
      toArrayScan(true),
    ),
  );

  onMount(() => {
    latestRxReq.emit({
      ...props.filter,
      since: now,
    });
  });

  const {
    data: oldEvents,
    fetchNextPage,
    hasNextPage,
    isFetching,
  } = createInfiniteRxQuery(() => ({
    parser: (e) => parseEventPacket(e),
    filter: { ...props.filter },
    limit: 10,
  }));

  return (
    <div class="h-full divide-y">
      <For each={latestEvents()}>{(event) => <Event event={event} />}</For>
      <For each={oldEvents.pages}>
        {(page) => <For each={page}>{(event) => <Event event={event} />}</For>}
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

export default InfiniteEvents;
