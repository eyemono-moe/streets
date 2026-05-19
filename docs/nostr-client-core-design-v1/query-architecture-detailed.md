# Query Architecture Detailed Design

Status: reference-only detailed draft. Do not treat this as the first implementation target. Current implementation guidance lives in the root index, `core-contract.md`, `query-lifecycle-ja.md`, and `debug-poc.md`.

This document turns the query/loading/batching direction into an implementation-oriented design.

It combines:

- Applesauce's responsibility split: `EventStore` / derived models / loaders.
- NDK's lifecycle split: logical subscriptions / physical relay subscriptions / grouping.
- streets-specific requirements: multi-column UI, many simultaneous auxiliary requests, and strict separation between feed lifecycle and cache warmers.

## Design goals

- Keep raw Nostr events in one source of truth.
- Prevent UI components from issuing relay requests directly.
- Make profile/event/relation fanout batchable and observable.
- Keep logical query lifecycle separate from physical relay subscription lifecycle.
- Keep feed/column UI lifecycle separate from raw event storage.
- Preserve a small project-owned core around `rx-nostr` instead of adopting a large external abstraction wholesale.

## Influences

### From Applesauce

Use Applesauce mainly as the responsibility-separation reference:

```txt
EventStore:
  reactive raw event database / source of event truth

Models:
  derived observable state from EventStore
  do not fetch from relays

Loaders:
  relay/cache loading helpers
  batch, dedupe, follow relay hints, and populate EventStore
```

streets mapping:

```txt
EventStore:
  raw event truth and Nostr-filter indexes

ProfileView / RelationsView / other derived views:
  read-only derived state over EventStore
  never fetch

QueryClient / QueryRegistry:
  streets loader/query layer
  fetches from relays/cache and populates EventStore
```

### From NDK

Use NDK mainly as the lifecycle and grouping reference:

```txt
NDKSubscription:
  logical application-level subscription

NDKRelaySubscription:
  physical relay-level subscription

NDKRelaySubscriptionManager:
  grouping, execution delay, relay-level lifecycle
```

streets mapping:

```txt
QueryListener / EventFeed:
  logical query/feed listener

TransportSubscription:
  physical rx-nostr/relay request

QueryRegistry:
  maps logical listeners to physical requests
  batches, dedupes, ref-counts, routes packets
```

Important NDK lesson:

```txt
physical EOSE != logical query completion != feed completion
```

## Layer overview

```txt
Solid UI / Columns / Event components
  ↓
Solid hooks
  ↓
QueryClient
  ↓
QueryRegistry
  ↓
RelayRequestPlanner
  ↓
NostrTransport
  ↓
RxNostrTransport
  ↓
rx-nostr

relay EVENT / EOSE / CLOSED
  ↓
RxNostrTransport
  ↓
QueryRegistry packet routing
  ↓
IngestionPipeline
  ↓
EventStore
  ↓
Derived Views + FeedStateStore
  ↓
Solid snapshot hooks
  ↓
UI re-render
```

## Dependency rules

Allowed dependencies:

```txt
UI Components
  -> Solid hooks
  -> QueryClient only indirectly through hooks
  -> EventStore / FeedStateStore / DerivedView snapshots only indirectly through hooks

Solid hooks
  -> QueryClient
  -> EventStore / FeedStateStore / DerivedView snapshots

QueryClient
  -> EventStore
  -> FeedStateStore
  -> Derived Views
  -> QueryRegistry
  -> IngestionPipeline

QueryRegistry
  -> RelayRequestPlanner
  -> NostrTransport
  -> eventMatchesFilter

RelayRequestPlanner
  -> relay settings
  -> future relay-list/profile data for outbox planning

IngestionPipeline
  -> EventStore
  -> FeedStateStore

Derived Views
  -> EventStore

FeedStateStore
  -> no transport
  -> no query registry

EventStore
  -> Nostr helper functions only
```

Forbidden dependencies:

```txt
EventStore -> QueryClient
EventStore -> Transport
EventStore -> Solid
DerivedView -> QueryClient
DerivedView -> Transport
FeedStateStore -> QueryRegistry
FeedStateStore -> Transport
UI component -> Transport
UI component -> rx-nostr
UI component -> RelayRequestPlanner
Parser/projector -> relay request
```

## Layer details

## 1. NostrTransport

Path:

```txt
src/core/transport/NostrTransport.ts
src/core/transport/RxNostrTransport.ts
```

Responsibility:

- Hide `rx-nostr`.
- Send backward requests.
- Send forward/live requests.
- Convert rx-nostr packets into streets transport packets.
- Close physical subscriptions.
- Expose connection state if needed.

Not responsible for:

- Batching.
- Dedupe.
- EventStore writes.
- Feed state updates.
- Filter planning.

Core types:

```ts
export type NostrFilter = {
  ids?: string[]
  authors?: string[]
  kinds?: number[]
  since?: number
  until?: number
  limit?: number
  search?: string
  [tag: `#${string}`]: string[] | undefined
}

export type RelayUrl = string

export type EventPacket = {
  type: 'event'
  requestId: string
  subId: string
  relay: RelayUrl
  event: NostrEvent
}

export type EosePacket = {
  type: 'eose'
  requestId: string
  subId: string
  relay: RelayUrl
}

export type ClosedPacket = {
  type: 'closed'
  requestId: string
  subId: string
  relay: RelayUrl
  message: string
}

export type TransportPacket = EventPacket | EosePacket | ClosedPacket

export type TransportSubscription = {
  requestId: string
  close: () => void
}

export interface NostrTransport {
  backward(input: {
    requestId: string
    relays: RelayUrl[]
    filters: NostrFilter[]
    onPacket: (packet: TransportPacket) => void
  }): TransportSubscription

  forward(input: {
    requestId: string
    relays: RelayUrl[]
    filters: NostrFilter[]
    onPacket: (packet: TransportPacket) => void
  }): TransportSubscription

  dispose(): void
}
```

rx-nostr 3.5 usage:

- Use `createRxBackwardReq(rxReqId?)` for backward requests.
- Use `createRxForwardReq(rxReqId?)` for forward/live requests.
- Treat `rxReqId` as the streets `requestId`.
- Treat packet `subId` as the concrete route key returned by rx-nostr.

The transport must not assume one filter per subscription.

## 2. RelayRequestPlanner

Path:

```txt
src/core/query/RelayRequestPlanner.ts
```

Responsibility:

- Convert logical query/feed intent into physical relay requests.
- Resolve relay policy.
- Later: split author filters by outbox model.
- Later: implement NDK-like `relayGoalPerAuthor` tradeoff.

Not responsible for:

- Executing requests.
- Batching.
- EventStore writes.
- Feed lifecycle.

Types:

```ts
export type RelayPolicy = {
  mode: 'default' | 'explicit' | 'outbox'
  relays?: RelayUrl[]
  relayGoalPerAuthor?: number
}

export type LogicalQueryKind =
  | 'event'
  | 'profile'
  | 'relations'
  | 'feed-initial'
  | 'feed-page'
  | 'feed-live'

export type PlannedRelayRequest = {
  requestMode: 'backward' | 'forward'
  relays: RelayUrl[]
  filters: NostrFilter[]
  purpose: LogicalQueryKind
}

export interface RelayRequestPlanner {
  plan(input: {
    kind: LogicalQueryKind
    filters: NostrFilter[]
    relayPolicy?: RelayPolicy
  }): PlannedRelayRequest[]
}
```

Initial implementation:

```ts
function plan(input) {
  return [{
    requestMode: input.kind === 'feed-live' ? 'forward' : 'backward',
    relays: resolveDefaultOrExplicitRelays(input.relayPolicy),
    filters: input.filters,
    purpose: input.kind,
  }]
}
```

Outbox-aware splitting is a later extension, not required for the first implementation.

## 3. QueryRegistry

Path:

```txt
src/core/query/QueryRegistry.ts
src/core/query/eventMatchesFilter.ts
src/core/query/queryKeys.ts
```

Responsibility:

- Register logical listeners.
- Create physical transport requests.
- Batch auxiliary backward warmers.
- Dedupe/ref-count forward live requests.
- Route EVENT/EOSE/CLOSED packets.
- Run client-side filter matching for multi-filter REQs.
- Manage listener-level timeout/complete/close.
- Close underlying transport subscriptions.

Not responsible for:

- Raw event storage.
- Feed completion decisions.
- Solid state.
- rx-nostr direct access.

Types:

```ts
export type QueryRequestMode = 'backward' | 'forward'

export type ListenerCompleteReason =
  | 'matched'
  | 'eose'
  | 'closed'
  | 'timeout'
  | 'disposed'

export type QueryListener = {
  id: string
  filters: NostrFilter[]
  closeOnFirstEvent?: boolean
  timeoutMs?: number

  onEvent: (packet: EventPacket) => void
  onEose?: (packet: EosePacket) => void
  onClosed?: (packet: ClosedPacket) => void
  onComplete?: (reason: ListenerCompleteReason) => void
  onError?: (error: unknown) => void
}

export type QueryHandle = {
  listenerId: string
  close: () => void
}

export interface QueryRegistry {
  requestBackward(input: {
    filters: NostrFilter[]
    relayPolicy?: RelayPolicy
    listeners: QueryListener[]
    batchable?: boolean
    purpose: 'event' | 'profile' | 'relations' | 'feed-page' | 'feed-initial'
  }): QueryHandle[]

  subscribeForward(input: {
    filters: NostrFilter[]
    relayPolicy?: RelayPolicy
    listeners: QueryListener[]
    dedupeKey?: string
    purpose: 'feed-live'
  }): QueryHandle[]

  dispose(): void
}
```

### 3.1 Auxiliary backward batching

Batch only auxiliary cache warmers first:

- `ensureEvent`
- `ensureProfile`
- `ensureEventRelations`

Do not batch these in the same mechanism initially:

- `fetchMoreEventFeed`
- `ensureEventFeed` initial page
- forward/live feeds

Initial batch window:

```ts
const DEFAULT_BACKWARD_BATCH_WINDOW_MS = 40
```

Use 32-50ms as the intended range. 100ms is acceptable as an upper baseline but may feel sluggish for visible profile/event auxiliary data.

Batch key:

```txt
mode + relay policy + purpose
```

Safer initial grouping:

```txt
profile warmers separate from event warmers separate from relation warmers
```

Internal pending batch shape:

```ts
type PendingBackwardBatch = {
  key: string
  requestId: string
  relayPolicy?: RelayPolicy
  filters: NostrFilter[]
  listeners: Map<string, QueryListener>
  timerId: number
}
```

Registration algorithm:

```ts
function requestBackward(input) {
  if (!input.batchable) return startBackwardRequestImmediately(input)

  const batch = getOrCreatePendingBatch(input)

  for (const listener of input.listeners) {
    batch.listeners.set(listener.id, listener)
    for (const filter of listener.filters) batch.filters.push(filter)
    startListenerTimeout(batch, listener)
  }

  return input.listeners.map(listener => ({
    listenerId: listener.id,
    close: () => closeListener(batch, listener.id, 'disposed'),
  }))
}
```

Flush algorithm:

```ts
function flushBatch(batch) {
  pendingBatches.delete(batch.key)

  const plannedRequests = planner.plan({
    kind: batchPurposeToPlannerKind(batch),
    filters: batch.filters,
    relayPolicy: batch.relayPolicy,
  })

  for (const planned of plannedRequests) {
    const sub = transport.backward({
      requestId: batch.requestId,
      relays: planned.relays,
      filters: planned.filters,
      onPacket: packet => routeBackwardPacket(batch, packet),
    })

    rememberPhysicalSubscription(batch, sub, planned.relays)
  }
}
```

Do not merge filters initially. Send a multi-filter REQ.

Unsafe merge example:

```ts
{ authors: [alice], kinds: [0], limit: 1 }
{ authors: [bob], kinds: [0], limit: 1 }
```

Do not merge into:

```ts
{ authors: [alice, bob], kinds: [0], limit: 1 }
```

because `limit: 1` applies to the whole REQ.

Prefer:

```ts
[
  { authors: [alice], kinds: [0], limit: 1 },
  { authors: [bob], kinds: [0], limit: 1 },
]
```

### 3.2 Packet routing

A relay EVENT packet only identifies subscription id, not the matching filter. QueryRegistry must match each listener itself.

EVENT routing:

```ts
function routeEvent(batch, packet) {
  for (const listener of batch.listeners.values()) {
    if (!listener.filters.some(filter => eventMatchesFilter(packet.event, filter))) continue

    listener.onEvent(packet)

    if (listener.closeOnFirstEvent) {
      completeListener(batch, listener.id, 'matched')
    }
  }

  if (batch.listeners.size === 0) closePhysicalRequests(batch)
}
```

EOSE routing:

```ts
function routeEose(batch, packet) {
  markRelayEose(batch, packet.relay)

  if (!allTargetRelaysFinished(batch)) return

  for (const listener of batch.listeners.values()) {
    listener.onEose?.(packet)
    completeListener(batch, listener.id, 'eose')
  }

  closePhysicalRequests(batch)
}
```

Timeout is listener-level, not batch-level:

```ts
function startListenerTimeout(batch, listener) {
  if (!listener.timeoutMs) return

  const timeoutId = setTimeout(() => {
    completeListener(batch, listener.id, 'timeout')
  }, listener.timeoutMs)

  rememberListenerTimeout(listener.id, timeoutId)
}
```

### 3.3 Forward/live dedupe

Forward/live subscriptions can be deduped and ref-counted.

Internal shape:

```ts
type SharedForwardSubscription = {
  key: string
  requestId: string
  transportSub: TransportSubscription
  listeners: Map<string, QueryListener>
  refCount: number
}
```

Algorithm:

```ts
function subscribeForward(input) {
  const key = input.dedupeKey ?? createForwardDedupeKey(input)
  let shared = activeForward.get(key)

  if (!shared) {
    shared = startNewForwardSubscription(input, key)
    activeForward.set(key, shared)
  }

  for (const listener of input.listeners) {
    shared.listeners.set(listener.id, listener)
    shared.refCount++
  }

  return input.listeners.map(listener => ({
    listenerId: listener.id,
    close: () => closeForwardListener(shared, listener.id),
  }))
}
```

Close behavior:

```ts
function closeForwardListener(shared, listenerId) {
  if (!shared.listeners.delete(listenerId)) return

  shared.refCount--

  if (shared.refCount === 0) {
    shared.transportSub.close()
    activeForward.delete(shared.key)
  }
}
```

## 4. QueryClient

Path:

```txt
src/core/query/QueryClient.ts
```

Responsibility:

- Public API used by hooks/components.
- Check local EventStore/views first.
- Register relay work with QueryRegistry if local data is missing.
- Pass received events to IngestionPipeline.
- Update FeedStateStore for feed lifecycle APIs.

Not responsible for:

- Physical request routing.
- Batching internals.
- rx-nostr.

API:

```ts
export interface QueryClient {
  ensureEvent(input: EnsureEventInput): Promise<NostrEvent | undefined>
  ensureProfile(input: EnsureProfileInput): Promise<NostrProfile | undefined>
  ensureEventRelations(input: EnsureEventRelationsInput): Promise<NostrEvent[]>

  ensureEventFeed(input: EnsureEventFeedInput): EventFeedHandle
  fetchMoreEventFeed(feedId: string): Promise<void>
  stopEventFeed(feedId: string): void

  dispose(): void
}
```

### 4.1 ensureEvent

Purpose: fetch/cache-warm a raw event by id.

Input:

```ts
type EnsureEventInput = {
  id: string
  relays?: RelayUrl[]
  timeoutMs?: number
}
```

Flow:

```txt
ensureEvent(id)
  -> EventStore.getById(id)
  -> if present, return it
  -> QueryRegistry.requestBackward({ ids: [id], closeOnFirstEvent, batchable })
  -> EVENT
  -> IngestionPipeline.ingest(event)
  -> EventStore.putEvent(event)
  -> listener complete
  -> resolve EventStore.getById(id)
```

Pseudo-code:

```ts
async function ensureEvent(input: EnsureEventInput) {
  const cached = eventStore.getById(input.id)
  if (cached) return cached

  const filter = { ids: [input.id] } satisfies NostrFilter

  return new Promise<NostrEvent | undefined>((resolve) => {
    registry.requestBackward({
      purpose: 'event',
      batchable: true,
      relayPolicy: input.relays ? { mode: 'explicit', relays: input.relays } : { mode: 'default' },
      filters: [filter],
      listeners: [{
        id: createListenerId(),
        filters: [filter],
        closeOnFirstEvent: true,
        timeoutMs: input.timeoutMs ?? 3000,
        onEvent: packet => ingestion.ingest(packet.event, {
          relay: packet.relay,
          source: 'ensureEvent',
        }),
        onComplete: () => resolve(eventStore.getById(input.id)),
      }],
    })
  })
}
```

### 4.2 ensureProfile

Purpose: fetch/cache-warm latest kind:0 metadata for a pubkey.

Input:

```ts
type EnsureProfileInput = {
  pubkey: string
  relays?: RelayUrl[]
  timeoutMs?: number
}
```

Filter:

```ts
{ authors: [pubkey], kinds: [0], limit: 1 }
```

Flow:

```txt
ensureProfile(pubkey)
  -> ProfileView.getProfile(pubkey)
  -> if present, return it
  -> QueryRegistry.requestBackward(profile filter, batchable)
  -> EVENT kind:0
  -> IngestionPipeline.ingest
  -> EventStore.putEvent
  -> ProfileView derives latest profile
  -> resolve ProfileView.getProfile(pubkey)
```

Add short-lived in-flight dedupe by pubkey + relay policy to prevent repeated hook calls from issuing duplicates before the batch window flushes.

Pseudo-code:

```ts
const inFlightProfiles = new Map<string, Promise<NostrProfile | undefined>>()

async function ensureProfile(input: EnsureProfileInput) {
  const cached = profileView.getProfile(input.pubkey)
  if (cached) return cached

  const key = stableJson({ pubkey: input.pubkey, relays: input.relays ?? null })
  const existing = inFlightProfiles.get(key)
  if (existing) return existing

  const filter = {
    authors: [input.pubkey],
    kinds: [0],
    limit: 1,
  } satisfies NostrFilter

  const promise = new Promise<NostrProfile | undefined>((resolve) => {
    registry.requestBackward({
      purpose: 'profile',
      batchable: true,
      relayPolicy: input.relays ? { mode: 'explicit', relays: input.relays } : { mode: 'default' },
      filters: [filter],
      listeners: [{
        id: createListenerId(),
        filters: [filter],
        closeOnFirstEvent: true,
        timeoutMs: input.timeoutMs ?? 3000,
        onEvent: packet => ingestion.ingest(packet.event, {
          relay: packet.relay,
          source: 'ensureProfile',
        }),
        onComplete: () => resolve(profileView.getProfile(input.pubkey)),
      }],
    })
  }).finally(() => {
    setTimeout(() => inFlightProfiles.delete(key), 250)
  })

  inFlightProfiles.set(key, promise)
  return promise
}
```

### 4.3 ensureEventRelations

Purpose: fetch/cache-warm events related to another event.

Input:

```ts
type RelationKind = 'replies' | 'reactions' | 'reposts' | 'quotes'

type EnsureEventRelationsInput = {
  eventId: string
  relation: RelationKind
  relays?: RelayUrl[]
  limit?: number
  timeoutMs?: number
}
```

Filter examples:

```ts
// reactions
{ kinds: [7], '#e': [eventId], limit: 100 }

// reposts
{ kinds: [6, 16], '#e': [eventId], limit: 100 }

// quotes
{ '#q': [eventId], limit: 100 }

// replies
{ kinds: [1], '#e': [eventId], limit: 100 }
```

Do not use `closeOnFirstEvent`. Complete on EOSE or timeout.

Pseudo-code:

```ts
async function ensureEventRelations(input: EnsureEventRelationsInput) {
  const filter = relationToFilter(input)
  const existing = eventStore.query(filter)
  if (existing.length > 0) return existing

  return new Promise<NostrEvent[]>((resolve) => {
    registry.requestBackward({
      purpose: 'relations',
      batchable: true,
      relayPolicy: input.relays ? { mode: 'explicit', relays: input.relays } : { mode: 'default' },
      filters: [filter],
      listeners: [{
        id: createListenerId(),
        filters: [filter],
        timeoutMs: input.timeoutMs ?? 3000,
        onEvent: packet => ingestion.ingest(packet.event, {
          relay: packet.relay,
          source: 'ensureEventRelations',
        }),
        onComplete: () => resolve(eventStore.query(filter)),
      }],
    })
  })
}
```

## 5. EventStore

Path:

```txt
src/core/store/EventStore.ts
src/core/store/MemoryEventStore.ts
src/core/nostr/filters.ts
src/core/nostr/replaceable.ts
```

Responsibility:

- Store raw events.
- Dedupe by id.
- Merge seen relays.
- Handle replaceable/addressable newest selection.
- Handle delete events.
- Query by Nostr filter semantics.
- Expose getSnapshot + subscribe.

Not responsible for:

- Relay fetch.
- Feed loading state.
- Solid state.

Types:

```ts
export type StoredEvent = {
  event: NostrEvent
  seenRelays: Set<RelayUrl>
  firstSeenAt: number
  lastSeenAt: number
}

export interface EventStore {
  putEvent(event: NostrEvent, meta?: {
    relay?: RelayUrl
    receivedAt?: number
  }): StoredEvent

  getById(id: string): NostrEvent | undefined
  query(filter: NostrFilter): NostrEvent[]

  getLatestReplaceable(input: {
    kind: number
    pubkey: string
    d?: string
  }): NostrEvent | undefined

  subscribe(listener: () => void): () => void
  getSnapshot(): EventStoreSnapshot
  dispose(): void
}
```

Indexes:

```txt
byId: Map<eventId, StoredEvent>
byKind: Map<kind, Set<eventId>>
byAuthor: Map<pubkey, Set<eventId>>
byKindAuthor: Map<kind:pubkey, Set<eventId>>
byTag: Map<tag:value, Set<eventId>>
replaceableByAddress: Map<kind:pubkey:d, eventId>
createdAtSortedIds
```

`eventMatchesFilter` must be shared by EventStore query and QueryRegistry routing.

Important semantics:

- Filter array is OR.
- Fields inside one filter are AND.
- `ids`, `authors`, `kinds`, and tag values are OR within their field.
- `since` / `until` compare with `created_at`.
- `limit` is a result constraint, not an event-level match predicate.
- Avoid batching `search` or lazy time-window filters until their client-side semantics are defined.

## 6. Derived Views

Path:

```txt
src/core/views/ProfileView.ts
src/core/views/RelationsView.ts
```

Responsibility:

- Provide read-only derived state over EventStore.
- Parse profile metadata.
- Return relation lists/counts.
- Expose getSnapshot + subscribe helpers.

Not responsible for:

- Relay fetch.
- QueryClient calls.
- Transport.

### ProfileView

```ts
export type NostrProfile = {
  pubkey: string
  eventId: string
  createdAt: number
  metadata: Metadata
  seenRelays: RelayUrl[]
}

export interface ProfileView {
  getProfile(pubkey: string): NostrProfile | undefined
  subscribeProfile(pubkey: string, listener: () => void): () => void
  getSnapshot(): ProfileViewSnapshot
}
```

Implementation uses:

```ts
EventStore.getLatestReplaceable({ kind: 0, pubkey })
```

### RelationsView

```ts
export interface RelationsView {
  getReactions(eventId: string): NostrEvent[]
  getReplies(eventId: string): NostrEvent[]
  getReposts(eventId: string): NostrEvent[]
  getQuotes(eventId: string): NostrEvent[]

  subscribeRelations(input: {
    eventId: string
    relation: RelationKind
  }, listener: () => void): () => void
}
```

Implementation uses EventStore query filters.

## 7. FeedStateStore

Path:

```txt
src/core/feed/EventFeedDefinition.ts
src/core/feed/FeedStateStore.ts
src/core/feed/MemoryFeedStateStore.ts
```

Responsibility:

- Store feed/column membership and UI lifecycle.
- Track cursors.
- Track `hasNextPage`.
- Track live status.
- Track active/eosed relays.
- Track errors.

Not responsible for:

- Raw event truth.
- Relay request issuance.
- Transport.

Types:

```ts
export type FeedStatus = 'idle' | 'pending' | 'success' | 'error'
export type FetchStatus = 'idle' | 'fetching' | 'paused'
export type LiveStatus = 'idle' | 'connecting' | 'live' | 'closed' | 'error'

export type EventFeedDefinition = {
  feedId: string
  filters: NostrFilter[]
  relayPolicy?: RelayPolicy
  strategy: 'liveBackfill' | 'backwardOnly' | 'forwardOnly'
  limit?: number
  order?: 'created_at_desc' | 'created_at_asc'
}

export type EventFeedState = {
  feedId: string
  definition: EventFeedDefinition
  eventIds: string[]

  status: FeedStatus
  fetchStatus: FetchStatus
  error?: unknown

  hasNextPage: boolean
  isFetchingNextPage: boolean
  nextPageError?: unknown

  liveStatus: LiveStatus

  oldestCreatedAt?: number
  newestCreatedAt?: number

  activeRelays: RelayUrl[]
  eoseRelays: RelayUrl[]
}

export interface FeedStateStore {
  registerFeed(definition: EventFeedDefinition): void

  addFeedEvents(input: {
    feedId: string
    events: NostrEvent[]
  }): void

  setFeedStatus(feedId: string, patch: Partial<EventFeedState>): void
  getFeedState(feedId: string): EventFeedState | undefined
  getFeedEvents(feedId: string): string[]

  subscribeFeed(feedId: string, listener: () => void): () => void
  getSnapshot(): FeedStateStoreSnapshot
}
```

FeedStateStore stores event ids. Event bodies come from EventStore.

## 8. IngestionPipeline

Path:

```txt
src/core/ingestion/IngestionPipeline.ts
```

Responsibility:

- Single write path from relay packets into EventStore.
- Attach relay/source metadata.
- Add feed membership when source is feed-related.

Types:

```ts
export type IngestSource =
  | 'ensureEvent'
  | 'ensureProfile'
  | 'ensureEventRelations'
  | 'feedInitial'
  | 'feedPage'
  | 'feedLive'

export interface IngestionPipeline {
  ingest(event: NostrEvent, meta: {
    relay?: RelayUrl
    source: IngestSource
    feedId?: string
    receivedAt?: number
  }): void
}
```

Pseudo-code:

```ts
function ingest(event, meta) {
  const stored = eventStore.putEvent(event, {
    relay: meta.relay,
    receivedAt: meta.receivedAt ?? Date.now(),
  })

  if (meta.feedId) {
    feedStateStore.addFeedEvents({
      feedId: meta.feedId,
      events: [stored.event],
    })
  }
}
```

## Runtime flows

## A. Timeline column initial display

UI:

```tsx
<TimelineColumn />
```

Hook:

```ts
const feed = useEventFeed({
  feedId: 'timeline:home',
  strategy: 'liveBackfill',
  filters: [{ kinds: [1], authors: followeePubkeys, limit: 50 }],
})
```

Flow:

```txt
TimelineColumn
  -> useEventFeed(definition)
  -> queryClient.ensureEventFeed(definition)
  -> feedStateStore.registerFeed(definition)
  -> strategy liveBackfill:
       queryClient.fetchMoreEventFeed(feedId)
       queryClient.startLiveFeed(feedId)
```

`ensureEventFeed` pseudo-code:

```ts
function ensureEventFeed(definition) {
  feedStateStore.registerFeed(definition)

  if (definition.strategy === 'liveBackfill') {
    void fetchMoreEventFeed(definition.feedId)
    startLiveFeed(definition)
  }

  if (definition.strategy === 'backwardOnly') {
    void fetchMoreEventFeed(definition.feedId)
  }

  if (definition.strategy === 'forwardOnly') {
    startLiveFeed(definition)
  }

  return {
    feedId: definition.feedId,
    stop: () => stopEventFeed(definition.feedId),
  }
}
```

## B. Timeline initial backfill / fetch more

Flow:

```txt
fetchMoreEventFeed(feedId)
  -> FeedStateStore.getFeedState(feedId)
  -> build filters with until cursor
  -> QueryRegistry.requestBackward(batchable: false)
  -> EVENT packets
  -> IngestionPipeline.ingest(event, { feedId, source: 'feedPage' })
  -> EventStore.putEvent
  -> FeedStateStore.addFeedEvents
  -> EOSE/timeout
  -> FeedStateStore update:
       fetchStatus = idle
       isFetchingNextPage = false
       hasNextPage = page was full
       oldestCreatedAt = min received created_at
```

Pseudo-code:

```ts
async function fetchMoreEventFeed(feedId: string) {
  const state = feedStateStore.getFeedState(feedId)
  if (!state) return
  if (state.isFetchingNextPage) return

  feedStateStore.setFeedStatus(feedId, {
    fetchStatus: 'fetching',
    isFetchingNextPage: true,
    nextPageError: undefined,
  })

  const limit = state.definition.limit ?? 50
  const filters = state.definition.filters.map(filter => ({
    ...filter,
    until: state.oldestCreatedAt ? state.oldestCreatedAt - 1 : filter.until,
    limit: filter.limit ?? limit,
  }))

  const received: NostrEvent[] = []

  return new Promise<void>((resolve) => {
    registry.requestBackward({
      purpose: 'feed-page',
      batchable: false,
      relayPolicy: state.definition.relayPolicy,
      filters,
      listeners: [{
        id: createListenerId(),
        filters,
        timeoutMs: 8000,
        onEvent: packet => {
          received.push(packet.event)
          ingestion.ingest(packet.event, {
            relay: packet.relay,
            source: 'feedPage',
            feedId,
          })
        },
        onComplete: () => {
          const oldest = minCreatedAt(received)
          const newest = maxCreatedAt(received)

          feedStateStore.setFeedStatus(feedId, {
            status: 'success',
            fetchStatus: 'idle',
            isFetchingNextPage: false,
            oldestCreatedAt: oldest ? minDefined(state.oldestCreatedAt, oldest) : state.oldestCreatedAt,
            newestCreatedAt: newest ? maxDefined(state.newestCreatedAt, newest) : state.newestCreatedAt,
            hasNextPage: received.length >= limit,
          })

          resolve()
        },
        onError: error => {
          feedStateStore.setFeedStatus(feedId, {
            status: 'error',
            fetchStatus: 'idle',
            isFetchingNextPage: false,
            nextPageError: error,
          })
          resolve()
        },
      }],
    })
  })
}
```

## C. Timeline live subscription

Flow:

```txt
startLiveFeed(feedId)
  -> build forward filters
  -> for liveBackfill, add since = now
  -> QueryRegistry.subscribeForward(dedupe/refcount)
  -> EVENT
  -> IngestionPipeline.ingest(event, { feedId, source: 'feedLive' })
  -> EventStore + FeedStateStore update
  -> UI updates
```

Important rule:

For `liveBackfill`, live subscription starts at now. Historical content comes from backward `fetchMoreEventFeed`.

Pseudo-code:

```ts
function startLiveFeed(definition: EventFeedDefinition) {
  const now = Math.floor(Date.now() / 1000)
  const filters = definition.filters.map(filter => ({
    ...filter,
    since: definition.strategy === 'liveBackfill' ? now : filter.since,
  }))

  feedStateStore.setFeedStatus(definition.feedId, {
    liveStatus: 'connecting',
  })

  const handles = registry.subscribeForward({
    purpose: 'feed-live',
    filters,
    relayPolicy: definition.relayPolicy,
    dedupeKey: createFeedLiveDedupeKey(definition),
    listeners: [{
      id: createListenerId(),
      filters,
      onEvent: packet => {
        ingestion.ingest(packet.event, {
          relay: packet.relay,
          source: 'feedLive',
          feedId: definition.feedId,
        })
        feedStateStore.setFeedStatus(definition.feedId, {
          liveStatus: 'live',
        })
      },
      onEose: packet => {
        addEoseRelay(definition.feedId, packet.relay)
      },
      onClosed: () => {
        feedStateStore.setFeedStatus(definition.feedId, {
          liveStatus: 'closed',
        })
      },
    }],
  })

  rememberFeedLiveHandles(definition.feedId, handles)
}
```

## D. Event component display

UI:

```tsx
<Event eventId={id} />
```

Typical hooks:

```ts
const event = useCoreEventById(() => props.eventId)
const profile = useCoreProfile(() => event()?.pubkey)
const reactions = useCoreEventRelations(() => ({
  eventId: props.eventId,
  relation: 'reactions',
  enabled: showActions(),
}))
```

`useCoreEventById` flow:

```txt
useCoreEventById(id)
  -> EventStore.getById(id)
  -> subscribe EventStore
  -> if missing: queryClient.ensureEvent(id)
  -> EVENT arrives
  -> EventStore update
  -> hook snapshot updates
```

Pseudo-code:

```ts
function useCoreEventById(id: Accessor<string | undefined>) {
  const core = useNostrCore()
  const [event, setEvent] = createSignal<NostrEvent | undefined>()

  createEffect(() => {
    const currentId = id()
    if (!currentId) {
      setEvent(undefined)
      return
    }

    setEvent(core.eventStore.getById(currentId))

    const unsubscribe = core.eventStore.subscribe(() => {
      setEvent(core.eventStore.getById(currentId))
    })

    void core.queryClient.ensureEvent({ id: currentId }).then(() => {
      if (id() !== currentId) return
      setEvent(core.eventStore.getById(currentId))
    })

    onCleanup(unsubscribe)
  })

  return event
}
```

Hook implementations must use stable keys and must guard stale async results.

## E. Profile display

UI:

```tsx
<ProfileName pubkey={pubkey} />
```

Hook:

```ts
const profile = useCoreProfile(() => pubkey)
```

Flow:

```txt
useCoreProfile(pubkey)
  -> ProfileView.getProfile(pubkey)
  -> subscribe ProfileView/EventStore
  -> if missing: queryClient.ensureProfile(pubkey)
  -> kind:0 arrives
  -> EventStore.putEvent
  -> ProfileView updates
  -> UI updates
```

Profile hooks are high fanout. Required protections:

- stable key per pubkey + relay policy
- QueryClient in-flight dedupe
- QueryRegistry 40ms auxiliary batch
- stale accessor guard before signal writes

## Implementation order

1. Implement shared `eventMatchesFilter`.
2. Implement `EventStore` / `MemoryEventStore`.
3. Implement `ProfileView`.
4. Implement `FeedStateStore`.
5. Implement `IngestionPipeline`.
6. Ensure `NostrTransport` interface matches this design.
7. Implement/adjust `RxNostrTransport`.
8. Add default-only `RelayRequestPlanner`.
9. Implement `QueryRegistry` immediate backward request.
10. Implement `QueryClient.ensureEvent`.
11. Implement `QueryClient.ensureProfile`.
12. Implement `useCoreEventById`.
13. Implement `useCoreProfile`.
14. Add QueryRegistry auxiliary backward batching.
15. Implement `ensureEventRelations`.
16. Implement `ensureEventFeed`.
17. Implement `fetchMoreEventFeed`.
18. Implement `subscribeForward` / `startLiveFeed`.
19. Add devtools snapshots for EventStore / FeedStateStore / QueryRegistry.

## Test checklist

### EventStore

- Duplicate ids are stored once.
- Seen relays are merged.
- Replaceable kind:0 newest `created_at` wins.
- Parameterized replaceable address key is `kind:pubkey:d`.
- Missing `d` uses empty `d`.
- Arbitrary `#tag` queries work.
- `limit` is result slicing, not match predicate.

### QueryRegistry

- Backward request times out and closes.
- `closeOnFirstEvent` completes only the matching listener.
- Multi-filter REQ routes by client-side `eventMatchesFilter`.
- Profile A event does not close Profile B listener.
- EOSE completes listeners after target relays finish.
- Forward subscription dedupes/ref-counts.
- Closing the final forward listener closes physical subscription.

### QueryClient

- `ensureEvent` cache hit does not request relay.
- `ensureProfile` cache hit does not request relay.
- Concurrent same-profile ensure calls reuse in-flight promise.
- `ensureEventRelations` does not close on first event.
- `ensure*` cache warmers do not mark FeedStateStore complete.

### Feed lifecycle

- `ensureEventFeed` registers feed.
- `liveBackfill` triggers initial `fetchMoreEventFeed`.
- `liveBackfill` forward filter has `since: now`.
- `fetchMoreEventFeed` updates cursor and `hasNextPage`.
- Empty page preserves existing cursor.
- Short page sets `hasNextPage = false`.
- Feed events are added as feed membership while event bodies stay in EventStore.

## Summary

Implementation boundary summary:

```txt
EventStore:
  Applesauce-style raw event truth.

Derived Views:
  Applesauce-style models. They read, parse, and derive. They never fetch.

QueryClient / QueryRegistry:
  Applesauce loader idea + NDK subscription manager lifecycle, adapted for streets.

RelayRequestPlanner:
  NDK-style relay selection/outbox insertion point.

FeedStateStore:
  streets-specific multi-column feed lifecycle state.
```

Critical rule:

```txt
ensureEvent / ensureProfile / ensureEventRelations
  = auxiliary cache warmers
  = populate EventStore
  != feed lifecycle

ensureEventFeed / fetchMoreEventFeed / stopEventFeed
  = feed lifecycle APIs
  = update FeedStateStore
```

Critical batching rule:

```txt
A multi-filter REQ does not identify which filter matched.
QueryRegistry must keep each listener's original filter and run eventMatchesFilter before delivery.
```
