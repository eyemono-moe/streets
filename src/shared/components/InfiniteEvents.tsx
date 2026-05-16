import { createViewportObserver } from "@solid-primitives/intersection-observer";
import type { Filter } from "nostr-tools";
import { compareEvents } from "rx-nostr";
import {
  type Component,
  For,
  Match,
  Switch,
  onCleanup,
  onMount,
} from "solid-js";
import { createStore } from "solid-js/store";
import { ingestNostrCoreEvent, useRxNostr } from "../../context/rxNostr";
import type { NostrTransportFilter } from "../../core/transport/transport";
import { useI18n } from "../../i18n";
import { parseEventPacket } from "../libs/parser";
import { createInfiniteRxQuery } from "../libs/query";
import Event from "./Event";

const InfiniteEvents: Component<{
  filter: Filter;
  relays?: string[];
}> = (props) => {
  const t = useI18n();
  const { core } = useRxNostr();
  const [latestEvents, setLatestEvents] = createStore<
    ReturnType<typeof parseEventPacket>[]
  >([]);

  onMount(() => {
    const subscription = core.transport.subscribe({
      filters: {
        ...(props.filter as NostrTransportFilter),
        since: Math.floor(Date.now() / 1000),
      },
      relays: props.relays,
      defaultReadRelays: !props.relays,
      mode: "forward",
    });
    const observableSubscription = subscription.events$.subscribe({
      next: (packet) => {
        void ingestNostrCoreEvent(core, packet.event, packet.from).catch(() => {
          // Keep the live feed stream alive if projection rejects.
        });
        const parsed = parseEventPacket(packet);
        setLatestEvents((prev) => {
          if (prev.some((event) => event.raw.id === parsed.raw.id)) {
            return prev;
          }
          return [parsed, ...prev].sort((a, b) => -compareEvents(a.raw, b.raw));
        });
      },
    });
    subscription.emit({
      ...(props.filter as NostrTransportFilter),
      since: Math.floor(Date.now() / 1000),
    });

    onCleanup(() => {
      observableSubscription.unsubscribe();
      subscription.close();
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
      <For each={latestEvents}>
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
