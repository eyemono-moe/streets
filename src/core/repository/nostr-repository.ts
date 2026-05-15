import type { NostrEvent } from "nostr-tools";

export type RelayUrl = string;

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

export type NostrEventQuery = {
  ids?: readonly string[];
  authors?: readonly string[];
  kinds?: readonly number[];
  tags?: Readonly<Record<string, readonly string[]>>;
  limit?: number;
};

export interface NostrRepository {
  putEvent(input: PutEventInput): Promise<PutEventResult>;
  markSeen(id: string, relay: RelayUrl): Promise<void>;
  getEvent(id: string): Promise<NostrEvent | undefined>;
  getEvents(ids: readonly string[]): Promise<NostrEvent[]>;
  getSeenRelays(id: string): Promise<RelayUrl[]>;
  queryEvents(query: NostrEventQuery): Promise<NostrEvent[]>;
  getLatestReplaceable(
    kind: number,
    pubkey: string,
  ): Promise<NostrEvent | undefined>;
  getParameterizedReplaceable(
    kind: number,
    pubkey: string,
    d: string,
  ): Promise<NostrEvent | undefined>;
}
