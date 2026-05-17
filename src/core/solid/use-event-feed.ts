import stringify from "safe-stable-stringify";
import { createEffect, createSignal, onCleanup } from "solid-js";
import type { ParsedEventPacket } from "../../shared/libs/parser";
import { parseEventPacket } from "../../shared/libs/parser";
import type { EventFeedDefinition } from "../query/event-feed";
import type { RelayUrl } from "../repository/nostr-repository";
import type { NostrTransportFilter } from "../transport/transport";
import { useNostrCore } from "./provider";

const normalizeRelayUrls = (relays?: readonly RelayUrl[]) =>
  relays ? [...relays].sort() : undefined;

const normalizeFilter = (filter: NostrTransportFilter) =>
  Object.fromEntries(
    (Object.entries(filter) as Array<[string, unknown]>).sort(([a], [b]) =>
      a.localeCompare(b),
    ),
  );

const isFilterArray = (
  filters: NostrTransportFilter | readonly NostrTransportFilter[],
): filters is readonly NostrTransportFilter[] => Array.isArray(filters);

const normalizeFilters = (
  filters: NostrTransportFilter | readonly NostrTransportFilter[],
) => {
  if (isFilterArray(filters)) {
    return filters.map(normalizeFilter);
  }
  return normalizeFilter(filters);
};

export const createEventFeedId = ({
  filters,
  relays,
  strategy,
}: {
  filters: NostrTransportFilter | readonly NostrTransportFilter[];
  relays?: readonly RelayUrl[];
  strategy: EventFeedDefinition["strategy"];
}) => {
  const normalizedFilters = normalizeFilters(filters);
  return `feed:${stringify({
    filters: normalizedFilters,
    relays: normalizeRelayUrls(relays),
    strategy,
  })}`;
};

export const useCoreEventFeed = <T = ParsedEventPacket["parsed"]>(
  definition: () => EventFeedDefinition | undefined,
) => {
  const core = useNostrCore();
  const [events, setEvents] = createSignal<ParsedEventPacket<T>[]>([]);
  const [isFetching, setIsFetching] = createSignal(false);
  const [hasNextPage, setHasNextPage] = createSignal(true);
  let activeFeedId: string | undefined;
  let fetchInFlight = false;

  const syncFromFeedState = (feedId: string) => {
    const state = core.feedStateStore.getSnapshot(feedId);
    const parsed = state.eventIds.flatMap((eventId) => {
      const event = core.eventStore.getEvent(eventId);
      if (!event) {
        return [];
      }
      return [
        parseEventPacket({
          event,
          from: core.eventStore.getSeenRelays(event.id)[0] ?? "",
        }) as ParsedEventPacket<T>,
      ];
    });

    setEvents(parsed);
    setHasNextPage(state.hasMoreBackfill);
    if (!fetchInFlight) {
      setIsFetching(state.status === "loading");
    }
  };

  let unsubscribeFeed: (() => void) | undefined;
  let unsubscribeEvents: (() => void) | undefined;

  const stopActiveFeed = () => {
    unsubscribeFeed?.();
    unsubscribeFeed = undefined;
    unsubscribeEvents?.();
    unsubscribeEvents = undefined;
    if (activeFeedId !== undefined) {
      core.queryClient.stopEventFeed(activeFeedId);
      activeFeedId = undefined;
    }
  };

  // Register the current feed and read UI feed state from FeedStateStore rather
  // than TanStack collection projections. Definition factories may rebuild
  // equivalent objects frequently while deriving large timeline filters, so only
  // feed id changes recreate subscriptions.
  createEffect(() => {
    const currentDefinition = definition();
    if (!currentDefinition) {
      stopActiveFeed();
      setEvents([]);
      setIsFetching(false);
      setHasNextPage(false);
      return;
    }

    if (activeFeedId === currentDefinition.id) {
      return;
    }

    stopActiveFeed();
    activeFeedId = currentDefinition.id;
    setIsFetching(true);
    core.queryClient.ensureEventFeed(currentDefinition);

    const sync = () => {
      syncFromFeedState(currentDefinition.id);
    };
    unsubscribeFeed = core.feedStateStore.subscribe(currentDefinition.id, sync);
    unsubscribeEvents = core.eventStore.subscribe(sync);
    sync();
  });

  onCleanup(stopActiveFeed);

  const fetchNextPage = async () => {
    const feedId = activeFeedId ?? definition()?.id;
    if (!feedId || fetchInFlight) {
      return [];
    }
    fetchInFlight = true;
    setIsFetching(true);
    try {
      const packets = await core.queryClient.fetchMoreEventFeed(feedId);
      syncFromFeedState(feedId);
      return packets;
    } finally {
      fetchInFlight = false;
      setIsFetching(false);
    }
  };

  return {
    events,
    isFetching,
    hasNextPage,
    fetchNextPage,
  };
};
