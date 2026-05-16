import { createCollection, localOnlyCollectionOptions } from "@tanstack/db";
import type { LocalOnlyCollectionUtils } from "@tanstack/db";
import type {
  EventFeedItemRow,
  EventFeedStateRow,
  NostrCollections,
  NostrEventRow,
  NostrProfileRow,
  NostrQueryStateRow,
} from "./types";

export const createNostrCollections = (): NostrCollections => ({
  events: createCollection<NostrEventRow, string, LocalOnlyCollectionUtils>(
    localOnlyCollectionOptions<NostrEventRow, string>({
      id: "nostr-events",
      getKey: (row) => row.id,
    }),
  ),
  profiles: createCollection<NostrProfileRow, string, LocalOnlyCollectionUtils>(
    localOnlyCollectionOptions<NostrProfileRow, string>({
      id: "nostr-profiles",
      getKey: (row) => row.pubkey,
    }),
  ),
  queryStates: createCollection<
    NostrQueryStateRow,
    string,
    LocalOnlyCollectionUtils
  >(
    localOnlyCollectionOptions<NostrQueryStateRow, string>({
      id: "nostr-query-states",
      getKey: (row) => row.id,
    }),
  ),
  eventFeedItems: createCollection<
    EventFeedItemRow,
    string,
    LocalOnlyCollectionUtils
  >(
    localOnlyCollectionOptions<EventFeedItemRow, string>({
      id: "nostr-event-feed-items",
      getKey: (row) => row.id,
    }),
  ),
  eventFeedStates: createCollection<
    EventFeedStateRow,
    string,
    LocalOnlyCollectionUtils
  >(
    localOnlyCollectionOptions<EventFeedStateRow, string>({
      id: "nostr-event-feed-states",
      getKey: (row) => row.id,
    }),
  ),
});
