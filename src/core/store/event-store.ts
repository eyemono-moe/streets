import type { NostrEvent } from "nostr-tools";
import type { NostrTransportFilter } from "../transport/transport";

export type RelayUrl = string;
export type StoreUnsubscribe = () => void;

export type ReadableStore<T> = {
  getSnapshot(): T;
  subscribe(listener: () => void): StoreUnsubscribe;
};

export type StoredNostrEvent = {
  event: NostrEvent;
  seenRelays: readonly RelayUrl[];
};

export type PutEventInput = {
  event: NostrEvent;
  relay?: RelayUrl;
};

export type PutEventResult =
  | { type: "inserted"; event: NostrEvent }
  | { type: "duplicate"; event: NostrEvent };

export type EventStoreFilter = NostrTransportFilter;
export type EventStoreQuery = EventStoreFilter | readonly EventStoreFilter[];

export interface EventStore {
  putEvent(input: PutEventInput): PutEventResult;
  markSeen(id: string, relay: RelayUrl): void;
  getEvent(id: string): NostrEvent | undefined;
  getEvents(ids: readonly string[]): NostrEvent[];
  getSeenRelays(id: string): RelayUrl[];
  queryEvents(query: EventStoreQuery): NostrEvent[];
  getLatestReplaceable(kind: number, pubkey: string): NostrEvent | undefined;
  getParameterizedReplaceable(
    kind: number,
    pubkey: string,
    d: string,
  ): NostrEvent | undefined;
  subscribe(listener: () => void): StoreUnsubscribe;
}
