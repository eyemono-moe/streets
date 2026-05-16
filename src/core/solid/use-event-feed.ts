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
    (Object.entries(filter) as Array<[string, unknown]>)
      .map(([key, value]) => [
        key,
        Array.isArray(value) ? [...value].sort() : value,
      ])
      .sort(([a], [b]) => a.localeCompare(b)),
  );

const normalizeFilters = (
  filters: NostrTransportFilter | readonly NostrTransportFilter[],
) => {
  if (Array.isArray(filters)) {
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

  const syncFromCollections = (feedId: string) => {
    const state = core.collections.eventFeedStates.get(feedId);
    const rows = [...core.collections.eventFeedItems.values()]
      .filter((row) => row.feedId === feedId)
      .sort(
        (a, b) =>
          b.createdAt - a.createdAt ||
          b.insertedAt - a.insertedAt ||
          b.eventId.localeCompare(a.eventId),
      );
    const parsed = rows.flatMap((row) => {
      const eventRow = core.collections.events.get(row.eventId);
      if (!eventRow) {
        return [];
      }
      return [
        parseEventPacket({
          event: eventRow.raw,
          from: eventRow.seenRelays[0] ?? "",
        }) as ParsedEventPacket<T>,
      ];
    });

    setEvents(parsed);
    setHasNextPage(state?.hasMoreBackfill ?? true);
    if (!fetchInFlight) {
      setIsFetching(false);
    }
  };

  // Register the current feed with the core query client and keep this Solid accessor
  // synchronized with EventFeed read-model collections while the component is mounted.
  createEffect(() => {
    const currentDefinition = definition();
    if (!currentDefinition) {
      setEvents([]);
      setIsFetching(false);
      setHasNextPage(false);
      return;
    }

    activeFeedId = currentDefinition.id;
    setIsFetching(true);
    core.queryClient.ensureEventFeed(currentDefinition);

    const sync = () => {
      syncFromCollections(currentDefinition.id);
    };
    const itemSubscription = core.collections.eventFeedItems.subscribeChanges(
      sync,
      { includeInitialState: true },
    );
    const stateSubscription = core.collections.eventFeedStates.subscribeChanges(
      sync,
      { includeInitialState: true },
    );
    const eventSubscription = core.collections.events.subscribeChanges(sync, {
      includeInitialState: true,
    });
    sync();

    onCleanup(() => {
      itemSubscription.unsubscribe();
      stateSubscription.unsubscribe();
      eventSubscription.unsubscribe();
      core.queryClient.stopEventFeed(currentDefinition.id);
      if (activeFeedId === currentDefinition.id) {
        activeFeedId = undefined;
      }
    });
  });

  const fetchNextPage = async () => {
    const feedId = activeFeedId ?? definition()?.id;
    if (!feedId || fetchInFlight) {
      return [];
    }
    fetchInFlight = true;
    setIsFetching(true);
    try {
      const packets = await core.queryClient.fetchMoreEventFeed(feedId);
      syncFromCollections(feedId);
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
