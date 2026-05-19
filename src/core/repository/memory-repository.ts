import type { NostrEvent } from "nostr-tools";
import type { EventStore, EventStoreFilter } from "../store/event-store";
import { MemoryEventStore } from "../store/memory-event-store";
import type {
  NostrEventQuery,
  NostrRepository,
  PutEventInput,
  PutEventResult,
  RelayUrl,
} from "./nostr-repository";

const toEventStoreFilter = (query: NostrEventQuery): EventStoreFilter => {
  const filter: EventStoreFilter = {
    ids: query.ids ? [...query.ids] : undefined,
    authors: query.authors ? [...query.authors] : undefined,
    kinds: query.kinds ? [...query.kinds] : undefined,
    limit: query.limit,
  };

  for (const [name, values] of Object.entries(query.tags ?? {})) {
    filter[`#${name}`] = [...values];
  }

  return filter;
};

export class MemoryNostrRepository implements NostrRepository {
  constructor(readonly eventStore: EventStore = new MemoryEventStore()) {}

  getSnapshot() {
    return this.eventStore.getSnapshot();
  }

  async putEvent(input: PutEventInput): Promise<PutEventResult> {
    return this.eventStore.putEvent(input);
  }

  async markSeen(id: string, relay: RelayUrl): Promise<void> {
    this.eventStore.markSeen(id, relay);
  }

  async getEvent(id: string): Promise<NostrEvent | undefined> {
    return this.eventStore.getEvent(id);
  }

  async getEvents(ids: readonly string[]): Promise<NostrEvent[]> {
    return this.eventStore.getEvents(ids);
  }

  async getSeenRelays(id: string): Promise<RelayUrl[]> {
    return this.eventStore.getSeenRelays(id);
  }

  async queryEvents(query: NostrEventQuery): Promise<NostrEvent[]> {
    return this.eventStore.queryEvents(toEventStoreFilter(query));
  }

  async getLatestReplaceable(
    kind: number,
    pubkey: string,
  ): Promise<NostrEvent | undefined> {
    return this.eventStore.getLatestReplaceable(kind, pubkey);
  }

  async getParameterizedReplaceable(
    kind: number,
    pubkey: string,
    d: string,
  ): Promise<NostrEvent | undefined> {
    return this.eventStore.getParameterizedReplaceable(kind, pubkey, d);
  }
}
