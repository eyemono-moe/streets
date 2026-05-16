# TanStack DB Data Model

[Back to v1 design index](../nostr-client-core-design-v1.md)

TanStack DB read-model responsibilities and collection shapes. Raw events still belong to the repository.

## In this file

- [TanStack DB Layer](#tanstack-db-layer)
- [TanStack DB Collection Design](#tanstack-db-collection-design)

---

## TanStack DB Layer

### Purpose

TanStack DB should be the reactive read-model layer between the repository and SolidJS.

Use TanStack DB for:

- UI-facing collections.
- Live queries.
- Reactive subscription management.
- Derived read models.
- Joining events with profiles and other projections.
- Cross-tab collection synchronization where appropriate.

Do not use Solid's `createStore` to hold the entire event graph.

### Data Flow

```txt
rx-nostr EVENT
  ↓
normalize / validate
  ↓
repository.putEvent(packet)
  ↓
projectEvent(event)
  ↓
TanStack DB collection upserts
  ↓
SolidJS live queries update UI
```

### Important Rule

Do not make TanStack DB itself the raw event repository.

Preferred:

```txt
repository.putEvent()
  ↓
project to TanStack DB collections
```

Avoid:

```txt
eventsCollection is the repository
```

Reason: Nostr-specific behavior such as replaceable-event resolution, seen relay tracking, tag indexing, deletion handling, relay hints, and IndexedDB migrations should stay in the repository layer.

---

## TanStack DB Collection Design

### `events`

Raw or near-raw event rows.

```ts
export type EventRow = {
  id: string
  pubkey: string
  kind: number
  createdAt: number
  content: string
  tags: string[][]
  sig: string

  receivedAt: number
  seenOn: string[]
  deleted?: boolean
}
```

### `profiles`

Projection of `kind:0` metadata.

```ts
export type ProfileRow = {
  pubkey: string
  eventId: string
  name?: string
  displayName?: string
  picture?: string
  banner?: string
  about?: string
  nip05?: string
  lud16?: string
  updatedAt: number
}
```

### `contactLists`

Projection of `kind:3` contact lists.

```ts
export type ContactListRow = {
  pubkey: string
  eventId: string
  followees: string[]
  updatedAt: number
}
```

### `relayLists`

Projection of NIP-65 relay list metadata.

```ts
export type RelayListRow = {
  pubkey: string
  eventId: string
  readRelays: string[]
  writeRelays: string[]
  updatedAt: number
}
```

### `eventFeedItems`

A UI-facing event feed item projection. This should not duplicate raw events.

The core should not treat "timeline" as the generic list primitive. A timeline is only one feature-level use case: a feed that uses the `liveBackfill` strategy with filters for followee posts/reposts. Other columns, such as a user's reactions, a user's media events, notifications, and search results, should use the same feed primitive with different filters and sometimes different fetch strategies.

```ts
export type EventFeedItemRow = {
  id: string
  feedId: string
  eventId: string
  pubkey: string
  kind: number
  createdAt: number
  insertedAt: number

  score?: number
  matchedFilterIndex?: number
}
```

Suggested id:

```ts
const eventFeedItemId = `${feedId}:${eventId}`
```

This allows the same event to appear in multiple columns/feeds without duplicating the event row itself.

### `eventFeedStates`

Tracks fetch/live status for event feeds.

```ts
export type EventFeedStrategy =
  | "liveBackfill"
  | "latestOne"
  | "backfillOnly"
  | "liveOnly"
  | "byIds"

export type EventFeedStateRow = {
  id: string
  feedId: string
  strategy: EventFeedStrategy
  status: "idle" | "loading" | "live" | "error"
  error?: string
  oldestCreatedAt?: number
  newestCreatedAt?: number
  hasMoreBackfill?: boolean
  eoseRelays: string[]
  activeRelays: string[]
  updatedAt: number
}
```

Initial implementations may keep this as one row per feed. Later, this can be split into feed definition state and per-request state if the query registry needs finer-grained lifecycle tracking.

### `relayStatuses`

Projection of transport connection state.

```ts
export type RelayStatusRow = {
  relay: string
  state: string
  lastConnectedAt?: number
  lastErrorAt?: number
  lastError?: string
}
```

---

## Related Files

- [Runtime Architecture](./runtime-architecture.md)
- [SolidJS Integration](./solid-integration.md)
- [Event Feed Strategies](./event-feed-strategies.md)
