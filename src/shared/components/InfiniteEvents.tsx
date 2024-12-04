import { createViewportObserver } from "@solid-primitives/intersection-observer";
import type { Filter } from "nostr-tools";
import { createRxForwardReq, now, uniq } from "rx-nostr";
import { map, tap } from "rxjs";
import { type Component, For, Match, Switch, from, onMount } from "solid-js";
import { eventCacheSetter } from "../../context/eventCache";
import { useRxNostr } from "../../context/rxNostr";
import { useI18n } from "../../i18n";
import { parseEventPacket } from "../libs/parser";
import { cacheAndEmitRelatedEvent, createInfiniteRxQuery } from "../libs/query";
import { toArrayScan } from "../libs/rxjs";
import Event from "./Event";

const InfiniteEvents: Component<{
  filter: Filter;
  relays?: string[];
}> = (props) => {
  const t = useI18n();

  const latestRxReq = createRxForwardReq();
  const setter = eventCacheSetter();

  const {
    rxNostr,
    actions: { emit },
  } = useRxNostr();

  const latestEvents = from(
    rxNostr
      .use(latestRxReq, {
        on: {
          relays: props.relays,
          defaultReadRelays: !props.relays,
        },
      })
      .pipe(
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
    filter: props.filter,
    limit: 20,
    relays: props.relays,
  }));

  // @ts-ignore(6133) typescript can't detect `use` directive
  const [intersectionObserver] = createViewportObserver();

  return (
    <div class="h-full divide-y">
      <For each={latestEvents()}>
        {(event) => (
          <Event
            event={event}
            showActions
            showReactions
            collapseReplies
            showReplies
          />
        )}
      </For>
      <For each={oldEvents.pages}>
        {(page) => (
          <For each={page}>
            {(event) => (
              <Event
                event={event}
                showActions
                showReactions
                collapseReplies
                showReplies
              />
            )}
          </For>
        )}
      </For>
      <div
        use:intersectionObserver={(e) => {
          if (hasNextPage() && !isFetching() && e.isIntersecting) {
            console.log("fetching next page");
            fetchNextPage();
          }
        }}
      />
      <button
        class="flex h-25vh w-full items-start justify-center bg-transparent bg-transparent p-2 enabled:active:bg-alpha-active not-active:enabled:hover:bg-alpha-hover disabled:opacity-50 data-[loading='true']:cursor-progress"
        type="button"
        onClick={fetchNextPage}
        disabled={!hasNextPage() || isFetching()}
        data-loading={isFetching()}
      >
        <Switch fallback={t("loadMore")}>
          <Match when={isFetching()}>{t("loading")}</Match>
          <Match when={!hasNextPage()}>{t("noMoreEvents")}</Match>
        </Switch>
      </button>
    </div>
  );
};

export default InfiniteEvents;
