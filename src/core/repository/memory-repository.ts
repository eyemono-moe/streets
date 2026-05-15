import type { NostrEvent } from "nostr-tools";
import {
  getParameterizedReplaceableEventKey,
  getRegularReplaceableEventKey,
  getReplaceableEventKey,
  isParameterizedReplaceableKind,
  shouldReplaceEvent,
} from "../nostr/replaceable";
import type {
  NostrEventQuery,
  NostrRepository,
  PutEventInput,
  PutEventResult,
  RelayUrl,
  StoredNostrEvent,
} from "./nostr-repository";

const shouldReplaceIndexedEvent = (
  candidate: NostrEvent,
  current: NostrEvent | undefined,
) => !current || shouldReplaceEvent(candidate, current);

const eventMatchesQuery = (event: NostrEvent, query: NostrEventQuery) => {
  if (query.ids && !query.ids.includes(event.id)) {
    return false;
  }
  if (query.authors && !query.authors.includes(event.pubkey)) {
    return false;
  }
  if (query.kinds && !query.kinds.includes(event.kind)) {
    return false;
  }
  if (query.tags) {
    for (const [name, values] of Object.entries(query.tags)) {
      const hasTagValue = event.tags.some(
        (tag) =>
          tag[0] === name && tag[1] !== undefined && values.includes(tag[1]),
      );
      if (!hasTagValue) {
        return false;
      }
    }
  }
  return true;
};

export class MemoryNostrRepository implements NostrRepository {
  readonly #events = new Map<string, StoredNostrEvent>();
  readonly #latestReplaceable = new Map<string, string>();
  readonly #latestParameterizedReplaceable = new Map<string, string>();

  async putEvent(input: PutEventInput): Promise<PutEventResult> {
    const stored = this.#events.get(input.event.id);
    if (stored) {
      if (input.relay) {
        this.#addSeenRelay(stored, input.relay);
      }
      return { type: "duplicate", event: stored.event };
    }

    this.#events.set(input.event.id, {
      event: input.event,
      seenRelays: input.relay ? [input.relay] : [],
    });
    this.#indexReplaceable(input.event);

    return { type: "inserted", event: input.event };
  }

  async markSeen(id: string, relay: RelayUrl): Promise<void> {
    const stored = this.#events.get(id);
    if (!stored) {
      return;
    }
    this.#addSeenRelay(stored, relay);
  }

  async getEvent(id: string): Promise<NostrEvent | undefined> {
    return this.#events.get(id)?.event;
  }

  async getEvents(ids: readonly string[]): Promise<NostrEvent[]> {
    return ids
      .map((id) => this.#events.get(id)?.event)
      .filter((event): event is NostrEvent => event !== undefined);
  }

  async getSeenRelays(id: string): Promise<RelayUrl[]> {
    return [...(this.#events.get(id)?.seenRelays ?? [])];
  }

  async queryEvents(query: NostrEventQuery): Promise<NostrEvent[]> {
    const events = [...this.#events.values()]
      .map((stored) => stored.event)
      .filter((event) => eventMatchesQuery(event, query))
      .sort((a, b) => b.created_at - a.created_at || b.id.localeCompare(a.id));

    return query.limit ? events.slice(0, query.limit) : events;
  }

  async getLatestReplaceable(
    kind: number,
    pubkey: string,
  ): Promise<NostrEvent | undefined> {
    const id = this.#latestReplaceable.get(
      getRegularReplaceableEventKey(kind, pubkey),
    );
    return id ? this.#events.get(id)?.event : undefined;
  }

  async getParameterizedReplaceable(
    kind: number,
    pubkey: string,
    d: string,
  ): Promise<NostrEvent | undefined> {
    const id = this.#latestParameterizedReplaceable.get(
      getParameterizedReplaceableEventKey(kind, pubkey, d),
    );
    return id ? this.#events.get(id)?.event : undefined;
  }

  #addSeenRelay(stored: StoredNostrEvent, relay: RelayUrl) {
    if (stored.seenRelays.includes(relay)) {
      return;
    }
    (stored.seenRelays as RelayUrl[]).push(relay);
  }

  #indexReplaceable(event: NostrEvent) {
    const key = getReplaceableEventKey(event);
    if (!key) {
      return;
    }

    const index = isParameterizedReplaceableKind(event.kind)
      ? this.#latestParameterizedReplaceable
      : this.#latestReplaceable;
    const current = this.#eventForIndexedId(index.get(key));

    if (shouldReplaceIndexedEvent(event, current)) {
      index.set(key, event.id);
    }
  }

  #eventForIndexedId(id: string | undefined) {
    return id ? this.#events.get(id)?.event : undefined;
  }
}
