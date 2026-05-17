import type { NostrEvent } from "nostr-tools";
import {
  getParameterizedReplaceableEventKey,
  getRegularReplaceableEventKey,
  getReplaceableEventKey,
  isParameterizedReplaceableKind,
  shouldReplaceEvent,
} from "../nostr/replaceable";
import type {
  EventStore,
  EventStoreFilter,
  EventStoreQuery,
  PutEventInput,
  PutEventResult,
  RelayUrl,
  StoreUnsubscribe,
  StoredNostrEvent,
} from "./event-store";

const normalizeQuery = (query: EventStoreQuery): readonly EventStoreFilter[] =>
  Array.isArray(query) ? query : [query];

const tagValuesFor = (event: NostrEvent, name: string) =>
  event.tags
    .filter((tag) => tag[0] === name && tag[1] !== undefined)
    .map((tag) => tag[1]);

const resolveCursor = (cursor: number | (() => number) | undefined) =>
  typeof cursor === "function" ? cursor() : cursor;

const eventMatchesFilter = (event: NostrEvent, filter: EventStoreFilter) => {
  if (filter.ids && !filter.ids.includes(event.id)) {
    return false;
  }
  if (filter.authors && !filter.authors.includes(event.pubkey)) {
    return false;
  }
  if (filter.kinds && !filter.kinds.includes(event.kind)) {
    return false;
  }

  const since = resolveCursor(filter.since);
  if (since !== undefined && event.created_at < since) {
    return false;
  }

  const until = resolveCursor(filter.until);
  if (until !== undefined && event.created_at > until) {
    return false;
  }

  for (const [key, value] of Object.entries(filter)) {
    if (!key.startsWith("#") || !Array.isArray(value)) {
      continue;
    }

    const expectedTagValues = value as readonly string[];
    const tagName = key.slice(1);
    const eventTagValues = tagValuesFor(event, tagName);
    if (
      !eventTagValues.some((tagValue) => expectedTagValues.includes(tagValue))
    ) {
      return false;
    }
  }

  return true;
};

const shouldReplaceIndexedEvent = (
  candidate: NostrEvent,
  current: NostrEvent | undefined,
) => !current || shouldReplaceEvent(candidate, current);

export class MemoryEventStore implements EventStore {
  readonly #events = new Map<string, StoredNostrEvent>();
  readonly #latestReplaceable = new Map<string, string>();
  readonly #latestParameterizedReplaceable = new Map<string, string>();
  readonly #listeners = new Set<() => void>();

  getSnapshot() {
    const kindCounts = new Map<number, number>();
    const relayCounts = new Map<RelayUrl, number>();
    let latestCreatedAt: number | undefined;

    for (const stored of this.#events.values()) {
      kindCounts.set(
        stored.event.kind,
        (kindCounts.get(stored.event.kind) ?? 0) + 1,
      );
      latestCreatedAt =
        latestCreatedAt === undefined
          ? stored.event.created_at
          : Math.max(latestCreatedAt, stored.event.created_at);
      for (const relay of stored.seenRelays) {
        relayCounts.set(relay, (relayCounts.get(relay) ?? 0) + 1);
      }
    }

    return {
      eventCount: this.#events.size,
      kindCounts: [...kindCounts.entries()]
        .map(([kind, count]) => ({ kind, count }))
        .sort((left, right) => left.kind - right.kind),
      relayCounts: [...relayCounts.entries()]
        .map(([relay, count]) => ({ relay, count }))
        .sort((left, right) => left.relay.localeCompare(right.relay)),
      latestCreatedAt,
    };
  }

  putEvent(input: PutEventInput): PutEventResult {
    const stored = this.#events.get(input.event.id);
    if (stored) {
      if (input.relay) {
        this.#addSeenRelay(stored, input.relay);
        this.#notify();
      }
      return { type: "duplicate", event: stored.event };
    }

    this.#events.set(input.event.id, {
      event: input.event,
      seenRelays: input.relay ? [input.relay] : [],
    });
    this.#indexReplaceable(input.event);
    this.#notify();

    return { type: "inserted", event: input.event };
  }

  markSeen(id: string, relay: RelayUrl): void {
    const stored = this.#events.get(id);
    if (!stored) {
      return;
    }
    if (this.#addSeenRelay(stored, relay)) {
      this.#notify();
    }
  }

  getEvent(id: string): NostrEvent | undefined {
    return this.#events.get(id)?.event;
  }

  getEvents(ids: readonly string[]): NostrEvent[] {
    return ids
      .map((id) => this.#events.get(id)?.event)
      .filter((event): event is NostrEvent => event !== undefined);
  }

  getSeenRelays(id: string): RelayUrl[] {
    return [...(this.#events.get(id)?.seenRelays ?? [])];
  }

  queryEvents(query: EventStoreQuery): NostrEvent[] {
    const filters = normalizeQuery(query);
    const limit = filters.reduce<number | undefined>((current, filter) => {
      if (filter.limit === undefined) {
        return current;
      }
      return current === undefined
        ? filter.limit
        : Math.max(current, filter.limit);
    }, undefined);

    const events = [...this.#events.values()]
      .map((stored) => stored.event)
      .filter((event) =>
        filters.some((filter) => eventMatchesFilter(event, filter)),
      )
      .sort((a, b) => b.created_at - a.created_at || b.id.localeCompare(a.id));

    return limit === undefined ? events : events.slice(0, limit);
  }

  getLatestReplaceable(kind: number, pubkey: string): NostrEvent | undefined {
    const id = this.#latestReplaceable.get(
      getRegularReplaceableEventKey(kind, pubkey),
    );
    return id ? this.#events.get(id)?.event : undefined;
  }

  getParameterizedReplaceable(
    kind: number,
    pubkey: string,
    d: string,
  ): NostrEvent | undefined {
    const id = this.#latestParameterizedReplaceable.get(
      getParameterizedReplaceableEventKey(kind, pubkey, d),
    );
    return id ? this.#events.get(id)?.event : undefined;
  }

  subscribe(listener: () => void): StoreUnsubscribe {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  #addSeenRelay(stored: StoredNostrEvent, relay: RelayUrl) {
    if (stored.seenRelays.includes(relay)) {
      return false;
    }
    (stored.seenRelays as RelayUrl[]).push(relay);
    return true;
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

  #notify() {
    for (const listener of this.#listeners) {
      listener();
    }
  }
}
