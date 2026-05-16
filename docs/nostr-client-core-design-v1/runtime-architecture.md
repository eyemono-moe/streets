# Runtime Architecture

[Back to v1 design index](../nostr-client-core-design-v1.md)

Architecture and ownership boundaries for rx-nostr, transport, EventStore, QueryRegistry, FeedStateStore, derived views, publishing, and cross-tab behavior.

## In this file

- [Core Architecture](#core-architecture)
- [Core Design Principle](#core-design-principle)
- [Proposed Directory Structure](#proposed-directory-structure)
- [Transport Layer](#transport-layer)
- [EventStore Layer](#eventstore-layer)
- [QueryRegistry and FeedStateStore](#queryregistry-and-feedstatestore)
- [Derived Views](#derived-views)
- [Cross-Tab Strategy](#cross-tab-strategy)

---

## Core Architecture

The proposed target architecture is:

```txt
rx-nostr
  ↓
RxNostrTransport
  ↓
QueryRegistry / PublishPipeline
  ↓
EventStore
  - Memory implementation
  - IndexedDB implementation
  - Seed/test implementation
  ↓
FeedStateStore + Derived Views
  - ProfileView
  - ContactsView
  - RelayListView
  - ReactionSummaryView
  - ThreadView
  ↓
SolidJS UI
```

### Responsibility Split

#### `rx-nostr`

`rx-nostr` should remain responsible for relay communication and subscription mechanics.

Use `rx-nostr` for:

- WebSocket relay connections.
- `REQ` / `CLOSE` lifecycle.
- Relay-level subscription queues.
- NIP-11 based relay limitation handling, especially `max_subscriptions`.
- EOSE handling and timeout behavior.
- Lazy connection and idle disconnection.
- Reconnection behavior.
- AUTH / OK / CLOSED / NOTICE handling.
- Signature verification integration.
- Default relay management.

Do **not** reimplement relay subscription management manually. It is very likely to become fragile.

#### Application Core

The application core should own:

- Feed intent and query planning.
- Relay selection policy.
- Filter merge and chunk policy.
- Outbox/NIP-65 logic.
- EventStore and persistent raw event storage.
- FeedStateStore for UI feed snapshots.
- Derived views over raw events.
- UI-facing query APIs.
- Multi-column query reuse.
- Related event fetch policy.
- PublishPipeline and optimistic local event overlays.
- Local development seed scenarios.

---

## Core Design Principle

The application should not treat `rx-nostr` as the global app state manager, and should not force Nostr filters through a generic database query model.

Instead:

```txt
rx-nostr = relay transport
RxNostrTransport = application adapter around rx-nostr
QueryRegistry = feed intent, dedupe, batching, reference counts, relay work
EventStore = raw events and Nostr-filter-first storage/indexing
FeedStateStore = per-feed UI snapshot state
Derived Views = kind-specific read models over EventStore
SolidJS = UI rendering layer
```

`rx-nostr` should be wrapped behind a transport interface so that most of the application does not directly depend on `rx-nostr` types.

---

## Proposed Directory Structure

```txt
src/core/nostr/
  event.ts
  filter.ts
  kinds.ts
  tags.ts
  parser/

src/core/transport/
  transport.ts
  rx-nostr-transport.ts
  rx-nostr-client.ts

src/core/store/
  event-store.ts
  memory-event-store.ts
  feed-state-store.ts
  memory-feed-state-store.ts
  readable-store.ts
  indexeddb-event-store.ts
  seeded-event-store.ts

src/core/views/
  profile-view.ts
  contacts-view.ts
  relay-list-view.ts
  reaction-summary-view.ts
  thread-view.ts

src/core/query/
  query-client.ts
  query-planner.ts
  query-registry.ts
  query-policy.ts
  relay-selector.ts
  related-event-policy.ts

src/core/publish/
  publish-pipeline.ts
  optimistic-events.ts

src/core/solid/
  provider.tsx
  use-store-snapshot.ts
  use-event.ts
  use-profile.ts
  use-event-feed.ts
  use-home-timeline.ts

src/features/
  timeline/
  profile/
  notifications/
  post/

src/legacy/
  query.ts
  event-cache.ts

dev/
  docker-compose.yml
  relays/
  assets/
  seeds/
    scenarios/
    keys.ts
    generate.ts
    push.ts
    reset.ts
```

The exact paths can be adjusted to match the current repository, but the responsibility boundaries should remain. The old `src/core/db/*` TanStack DB read-model surface has been removed from the v1 runtime; new read models should be implemented as EventStore-derived views or stores instead of reintroducing collection projectors.

---

## Transport Layer

### Goal

Hide `rx-nostr` behind an application-level transport interface.

Most code should depend on `NostrTransport`, not directly on `rx-nostr`.

### Interface Sketch

```ts
export interface NostrTransport {
  subscribe(req: PlannedReq): SubscriptionHandle
  send(event: EventParameters, opts?: SendOptions): Observable<PublishResult>
  observeAllEvents(): Observable<RelayEventPacket>
  observeConnectionState(): Observable<RelayConnectionStatePacket>
  observeOutgoing(): Observable<OutgoingRelayMessagePacket>
  dispose(): void
}

export interface SubscriptionHandle {
  close(): void
}
```

### `RxNostrTransport`

`RxNostrTransport` should internally use:

- `createRxNostr`
- `createRxForwardReq`
- `createRxBackwardReq`
- `rxNostr.use()`
- `rxNostr.send()` / `rxNostr.cast()`
- `rxNostr.createAllMessageObservable()`
- `rxNostr.createConnectionStateObservable()`

### Backward vs Forward Requests

Use two distinct subscription modes:

```txt
Backward request:
  - Initial load
  - Infinite scroll
  - Profile metadata fetch
  - Fetch by id
  - EOSE/timeout closes request

Forward request:
  - Live subscription
  - New event feed events
  - Long-running column subscription
```

A single `liveBackfill` event feed may use both:

```txt
Home timeline feature:
  - Backfill request for historical events
  - Forward request for new live events
```

---

## EventStore Layer

### Purpose

The EventStore is the source of truth for raw Nostr events and Nostr-specific indexes. It should be independent from SolidJS and independent from TanStack DB.

FeedStateStore and derived views read from EventStore; they do not own raw event truth.

### Interface Sketch

```ts
export interface EventStore {
  putEvent(input: PutEventInput): PutEventResult
  markSeen(id: string, relay: RelayUrl): void
  getEvent(id: string): NostrEvent | undefined
  getEvents(ids: readonly string[]): NostrEvent[]
  getSeenRelays(id: string): RelayUrl[]
  queryEvents(filters: NostrFilter | readonly NostrFilter[]): NostrEvent[]
  getLatestReplaceable(kind: number, pubkey: string): NostrEvent | undefined
  getParameterizedReplaceable(kind: number, pubkey: string, d: string): NostrEvent | undefined
  subscribe(listener: () => void): () => void
}
```

### Implementations

#### `MemoryEventStore`

Used for early development, tests, and fast in-memory operation.

Should contain indexes such as:

```ts
class MemoryEventStore implements EventStore {
  private events = new Map<string, NostrEvent>()
  private replaceable = new Map<string, string>()
  private parameterizedReplaceable = new Map<string, string>()
  private byAuthor = new Map<string, Set<string>>()
  private byKind = new Map<number, Set<string>>()
  private byTag = new Map<string, Set<string>>()
  private seenRelays = new Map<string, Set<string>>()
}
```

#### `IndexedDbEventStore`

Used for real browser persistence.

Suggested object stores:

```txt
events
  key: event id

eventTags
  key: tag index key

replaceableIndex
  key: kind:pubkey

parameterizedReplaceableIndex
  key: kind:pubkey:d

seenRelays
  key: event id

relayHints
  key: pubkey or event id

queryCacheMeta
  key: query id
```

The exact IndexedDB schema can evolve, but raw events should remain persistable so that FeedStateStore and derived views can be rebuilt.

#### `SeededEventStore`

Used in local development and tests. It may be backed by memory and preloaded with deterministic seed data.

---

## QueryRegistry and FeedStateStore

QueryRegistry and FeedStateStore must stay separate.

```txt
QueryRegistry = network/query lifecycle
FeedStateStore = UI feed snapshot/read model
EventStore = raw events and Nostr-filter-first indexes
```

QueryRegistry handles feed definitions, filter canonicalization, relay selection, batching, deduplication, reference counts, and transport subscriptions.

FeedStateStore handles feed membership and state:

```txt
- event ids per feed
- loading/live/complete/error status
- EOSE relays
- active relays
- oldest/newest cursors
- hasMoreBackfill
- optimistic local items
```

Incoming event flow:

```ts
function onRelayEvent(feedId: string, packet: RelayEventPacket) {
  const result = eventStore.putEvent({ event: packet.event, relay: packet.relay })

  if (result.type !== "duplicate") {
    derivedViews.index(packet.event)
  }

  if (queryRegistry.eventMatchesFeed(packet.event, feedId)) {
    feedStateStore.addItem(feedId, packet.event)
  }
}
```

Real implementation should route one incoming event to every active feed it matches, not only the feed whose subscription delivered it. This keeps batched/deduplicated relay subscriptions from losing UI feed membership.

---

## Derived Views

Derived views provide kind-specific read APIs over EventStore. They are not separate source-of-truth stores.

Examples:

```txt
ProfileView:
  reads latest kind:0 event for pubkey

ContactsView:
  reads latest kind:3 event for pubkey

RelayListView:
  reads latest NIP-65 relay list metadata event

ReactionSummaryView:
  indexes kind:7 reactions by target event
```

A new NIP or event kind should normally add a new parser/view/indexer rather than changing EventStore's fundamental model.

---

## Cross-Tab Strategy

IndexedDB and BroadcastChannel can help with cross-tab data sharing, but relay connections need careful handling.

### Initial Strategy

Allow each tab to connect independently.

```txt
Phase 1:
  Each tab has its own rx-nostr instance.
  EventStore persistence shares local data where possible.
```

This is simpler and good enough for early development.

### Later Strategy

Add tab coordination.

```txt
Phase 2:
  BroadcastChannel notifies other tabs of repository writes.

Phase 3:
  Leader tab owns rx-nostr relay connections.
  Follower tabs request fetches from leader.

Phase 4:
  Consider SharedWorker if browser support and mobile constraints are acceptable.
```

Do not start with leader election unless needed.

---

## Related Files

- [Overview](./overview.md)
- [Event Store and Query Registry](./data-model.md)
- [Event Feed Strategies](./event-feed-strategies.md)
- [Migration Plan](./migration-plan.md)
