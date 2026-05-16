# Runtime Architecture

[Back to v1 design index](../nostr-client-core-design-v1.md)

Architecture and ownership boundaries for rx-nostr, transport, repository, projection, and cross-tab behavior.

## In this file

- [Core Architecture](#core-architecture)
- [Core Design Principle](#core-design-principle)
- [Proposed Directory Structure](#proposed-directory-structure)
- [Transport Layer](#transport-layer)
- [NostrRepository Layer](#nostrrepository-layer)
- [Projection Pipeline](#projection-pipeline)
- [Cross-Tab Strategy](#cross-tab-strategy)

---

## Core Architecture

The proposed architecture is:

```txt
rx-nostr
  ↓
RxNostrTransport
  ↓
NostrRepository
  - Memory implementation
  - IndexedDB implementation
  - Seed/test implementation
  ↓
Projection Pipeline
  ↓
TanStack DB Collections
  - events
  - profiles
  - contactLists
  - relayLists
  - eventFeedItems
  - eventFeedStates
  - relayStatuses
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

- Query planning.
- Relay selection policy.
- Filter merge and chunk policy.
- Outbox/NIP-65 logic.
- Repository and persistent raw event storage.
- Projection into TanStack DB collections.
- UI-facing query APIs.
- Multi-column query reuse.
- Related event fetch policy.
- Local development seed scenarios.

---

## Core Design Principle

The application should not treat `rx-nostr` as the global app state manager.

Instead:

```txt
rx-nostr = relay transport
NostrRepository = raw event repository and Nostr-specific storage/indexing
TanStack DB = reactive UI read model
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

src/core/repository/
  nostr-repository.ts
  memory-repository.ts
  indexeddb-repository.ts
  seeded-repository.ts

src/core/db/
  collections.ts
  schema.ts
  projectors/
    event.ts
    profile.ts
    contact-list.ts
    relay-list.ts
    event-feed.ts
    reaction.ts

src/core/query/
  query-client.ts
  query-planner.ts
  query-registry.ts
  query-policy.ts
  relay-selector.ts
  related-event-policy.ts

src/core/solid/
  provider.tsx
  use-event.ts
  use-profile.ts
  use-event-feed.ts
  use-home-timeline.ts
  use-live-query.ts

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

The exact paths can be adjusted to match the current repository, but the responsibility boundaries should remain.

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

## NostrRepository Layer

### Purpose

The repository layer is the source of truth for raw Nostr events and Nostr-specific indexes. It should be independent from SolidJS and mostly independent from TanStack DB.

TanStack DB collections are read models derived from repository writes.

### Interface Sketch

```ts
export interface NostrRepository {
  putEvent(packet: RelayEventPacket): Promise<PutEventResult>
  getEvent(id: string): Promise<NostrEvent | undefined>
  getEvents(ids: string[]): Promise<NostrEvent[]>

  getLatestReplaceable(
    kind: number,
    pubkey: string,
  ): Promise<NostrEvent | undefined>

  getParameterizedReplaceable(
    kind: number,
    pubkey: string,
    d: string,
  ): Promise<NostrEvent | undefined>

  queryEvents(query: RepositoryEventQuery): Promise<NostrEvent[]>

  markSeen(eventId: string, relay: string): Promise<void>
  getSeenRelays(eventId: string): Promise<string[]>
}
```

### Repository Implementations

#### `MemoryNostrRepository`

Used for early development, tests, and fast in-memory operation.

Should contain:

```ts
class MemoryNostrRepository implements NostrRepository {
  private events = new Map<string, NostrEvent>()
  private replaceable = new Map<string, string>()
  private parameterizedReplaceable = new Map<string, string>()
  private byAuthorKind = new Map<string, Set<string>>()
  private byTag = new Map<string, Set<string>>()
  private seenRelays = new Map<string, Set<string>>()
}
```

#### `IndexedDbNostrRepository`

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

The exact IndexedDB schema can evolve, but raw events should remain persistable so that derived TanStack DB collections can be rebuilt.

#### `SeededNostrRepository`

Used in local development and tests. It may be backed by memory and preloaded with deterministic seed data.

---

## Projection Pipeline

Projection should happen after repository writes.

```ts
async function onRelayEvent(packet: RelayEventPacket) {
  const result = await repository.putEvent(packet)

  if (result.type === "duplicate") {
    await repository.markSeen(packet.event.id, packet.relay)
    await updateSeenOnCollection(packet)
    return
  }

  await projectEvent(packet.event, {
    repository,
    collections,
    relay: packet.relay,
  })
}
```

Example projector:

```ts
async function projectEvent(event: NostrEvent, ctx: ProjectionContext) {
  await ctx.collections.events.upsert({
    id: event.id,
    pubkey: event.pubkey,
    kind: event.kind,
    createdAt: event.created_at,
    content: event.content,
    tags: event.tags,
    sig: event.sig,
    receivedAt: Date.now(),
    seenOn: [ctx.relay],
  })

  if (event.kind === 0) {
    await projectProfile(event, ctx)
  }

  if (event.kind === 3) {
    await projectContactList(event, ctx)
  }

  if (event.kind === 10002) {
    await projectRelayList(event, ctx)
  }

  await projectIntoActiveEventFeeds(event, ctx)
}
```

Projection should be idempotent.

---

## Cross-Tab Strategy

TanStack DB and IndexedDB can help with cross-tab data sharing, but relay connections need careful handling.

### Initial Strategy

Allow each tab to connect independently.

```txt
Phase 1:
  Each tab has its own rx-nostr instance.
  Repository and TanStack DB persist/share local data where possible.
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
- [TanStack DB Data Model](./data-model.md)
- [Event Feed Strategies](./event-feed-strategies.md)
- [Migration Plan](./migration-plan.md)
