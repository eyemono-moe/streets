# Event Store and Query Registry Data Model

[Back to v1 design index](../nostr-client-core-design-v1.md)

Nostr-filter-first store responsibilities, feed state, and derived read-model shape. TanStack DB is not part of the target v1 architecture.

## In this file

- [Core Data Principle](#core-data-principle)
- [EventStore](#eventstore)
- [FeedStateStore](#feedstatestore)
- [QueryRegistry](#queryregistry)
- [Derived Views](#derived-views)
- [Persistence](#persistence)

---

## Core Data Principle

Nostr events are the source of truth.

The core data layer should not model profile, contacts, reactions, reposts, or future NIP concepts as independent source-of-truth stores. Those are derived views over raw events.

```txt
Raw Nostr event
  ↓
EventStore
  ↓
Derived views
  - ProfileView from kind:0
  - ContactsView from kind:3
  - RelayListView from NIP-65 events
  - ReactionSummaryView from kind:7
  - RepostView from repost kinds
  - future NIP-specific views
```

This keeps the core event-centered and makes new kinds easier to support. A new NIP should usually add a parser/view/indexer, not a new root storage model.

## EventStore

### Purpose

`EventStore` owns raw events and Nostr-specific indexing.

It should understand Nostr filter semantics directly:

```txt
- filters array is OR
- fields inside one filter are AND
- ids/authors/kinds/tag values are OR within that field
- since/until/limit are Nostr filter concepts, not generic SQL concepts
```

### Responsibilities

```txt
EventStore:
  - put raw events
  - dedupe by event id
  - track seen relays
  - query by Nostr filters
  - maintain indexes by id, author, kind, tags, and replaceable keys
  - resolve regular replaceable events
  - resolve parameterized replaceable events
  - expose getSnapshot + subscribe adapters for UI/read-model layers
```

### Interface Sketch

```ts
export type StoreSubscription = () => void

export interface ReadableStore<T> {
  getSnapshot(): T
  subscribe(listener: () => void): StoreSubscription
}

export interface EventStore {
  putEvent(input: PutEventInput): PutEventResult
  markSeen(id: string, relay: RelayUrl): void
  getEvent(id: string): NostrEvent | undefined
  getEvents(ids: readonly string[]): NostrEvent[]
  getSeenRelays(id: string): RelayUrl[]
  queryEvents(filters: NostrFilter | readonly NostrFilter[]): NostrEvent[]
  getLatestReplaceable(kind: number, pubkey: string): NostrEvent | undefined
  getParameterizedReplaceable(kind: number, pubkey: string, d: string): NostrEvent | undefined
  subscribe(listener: () => void): StoreSubscription
}
```

The initial implementation can be memory-only. IndexedDB should be added behind the same interface later.

## FeedStateStore

### Purpose

`FeedStateStore` is the UI-facing state for feed/query results. It is separate from `EventStore` because the same event can belong to many feeds.

```txt
event X
  belongs to home timeline
  belongs to alice profile posts
  belongs to #nostr search
  belongs to thread replies
```

The event is stored once in `EventStore`. Feed membership is stored per feed.

### Responsibilities

```txt
FeedStateStore:
  - keep event ids per feed
  - preserve feed-specific ordering
  - track loading/live/eose/error status per feed
  - track oldest/newest cursors per feed
  - track hasMoreBackfill
  - include optimistic local event ids when publish pipeline inserts them
  - expose getSnapshot + subscribe adapters
```

### Interface Sketch

```ts
export type FeedStatus = "idle" | "loading" | "live" | "complete" | "error"

export type FeedSnapshot = {
  feedId: string
  eventIds: readonly string[]
  status: FeedStatus
  error?: string
  oldestCreatedAt?: number
  newestCreatedAt?: number
  hasMoreBackfill: boolean
  eoseRelays: readonly RelayUrl[]
  activeRelays: readonly RelayUrl[]
}

export interface FeedStateStore {
  getSnapshot(feedId: string): FeedSnapshot
  subscribe(feedId: string, listener: () => void): StoreSubscription
  addItem(feedId: string, event: NostrEvent): void
  setStatus(feedId: string, status: FeedStatus, options?: FeedStatusOptions): void
  removeFeed(feedId: string): void
}
```

`FeedStateStore` does not decide which relay filters to emit. It only records feed-visible state.

## QueryRegistry

### Purpose

`QueryRegistry` owns relay-facing query lifecycle.

It turns UI/feed intent into shared rx-nostr work and keeps UI feed state tied to the originating feed even when relay filters are deduplicated or batched.

### Responsibilities

```txt
QueryRegistry:
  - accept EventFeedDefinition from UI/features
  - canonicalize filters
  - dedupe identical subscriptions
  - batch compatible relay work
  - reference-count active work
  - call RxNostrTransport
  - route incoming events into EventStore
  - add matching event ids to FeedStateStore
  - update per-feed loading/eose/error state
  - release unused feed/subscription work
```

### Difference from FeedStateStore

```txt
QueryRegistry = network/query lifecycle
FeedStateStore = UI feed snapshot/read model
EventStore = raw events and Nostr-filter-first indexes
```

Do not merge these responsibilities. Keeping them separate prevents relay optimization from erasing per-feed loading and empty-state information.

## Derived Views

Derived views provide convenient feature APIs without becoming source-of-truth stores.

Examples:

```ts
export interface ProfileView {
  get(pubkey: string): Profile | undefined
  subscribe(pubkey: string, listener: () => void): StoreSubscription
}
```

`ProfileView` reads the latest replaceable kind:0 event from `EventStore`, parses the JSON content, and returns a renderable profile object. It should not own profile truth independently.

The same pattern applies to contacts, relay lists, reaction summaries, repost summaries, thread views, and future NIP-specific views.

## Persistence

Persistence belongs behind EventStore interfaces.

Start with:

```txt
MemoryEventStore
MemoryFeedStateStore
```

Then add:

```txt
IndexedDbEventStore
IndexedDbPersistentCache
```

Initial IndexedDB scope should stay small:

```txt
- profiles / kind:0 events
- replaceable events
- relay list metadata
- contacts
- feed cursors or lightweight cache metadata
```

Do not require a full offline-first sync model for the initial v1 milestone.

---

## Related Files

- [Runtime Architecture](./runtime-architecture.md)
- [SolidJS Integration](./solid-integration.md)
- [Event Feed Strategies](./event-feed-strategies.md)
