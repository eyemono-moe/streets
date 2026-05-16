import type { Collection, LocalOnlyCollectionUtils } from "@tanstack/db";
import type { NostrEvent } from "nostr-tools";
import type { NostrEventQuery, RelayUrl } from "../repository/nostr-repository";

export type NostrEventRow = {
  id: string;
  pubkey: string;
  kind: number;
  createdAt: number;
  raw: NostrEvent;
  seenRelays: readonly RelayUrl[];
  receivedAt: number;
};

export type NostrProfileRow = {
  pubkey: string;
  name?: string;
  displayName?: string;
  about?: string;
  picture?: string;
  nip05?: string;
  lud16?: string;
  sourceEventId: string;
  updatedAt: number;
  receivedAt: number;
  seenRelays: readonly RelayUrl[];
};

export type NostrQueryStatus = "idle" | "loading" | "complete" | "error";

export type NostrQueryStateRow = {
  id: string;
  filter: NostrEventQuery;
  status: NostrQueryStatus;
  updatedAt: number;
  error?: string;
};

export type EventFeedStrategy =
  | "liveBackfill"
  | "latestOne"
  | "backfillOnly"
  | "liveOnly"
  | "byIds";

export type EventFeedStatus = "idle" | "loading" | "live" | "error";

export type EventFeedItemRow = {
  id: string;
  feedId: string;
  eventId: string;
  pubkey: string;
  kind: number;
  createdAt: number;
  insertedAt: number;
  score?: number;
  matchedFilterIndex?: number;
};

export type EventFeedStateRow = {
  id: string;
  feedId: string;
  strategy: EventFeedStrategy;
  status: EventFeedStatus;
  error?: string;
  oldestCreatedAt?: number;
  newestCreatedAt?: number;
  hasMoreBackfill?: boolean;
  eoseRelays: readonly RelayUrl[];
  activeRelays: readonly RelayUrl[];
  updatedAt: number;
};

export type NostrCollections = {
  events: Collection<
    NostrEventRow,
    string,
    LocalOnlyCollectionUtils,
    never,
    NostrEventRow
  >;
  profiles: Collection<
    NostrProfileRow,
    string,
    LocalOnlyCollectionUtils,
    never,
    NostrProfileRow
  >;
  queryStates: Collection<
    NostrQueryStateRow,
    string,
    LocalOnlyCollectionUtils,
    never,
    NostrQueryStateRow
  >;
  eventFeedItems: Collection<
    EventFeedItemRow,
    string,
    LocalOnlyCollectionUtils,
    never,
    EventFeedItemRow
  >;
  eventFeedStates: Collection<
    EventFeedStateRow,
    string,
    LocalOnlyCollectionUtils,
    never,
    EventFeedStateRow
  >;
};

export type ProjectionContext = {
  receivedAt?: number;
  seenRelays?: readonly RelayUrl[];
};
