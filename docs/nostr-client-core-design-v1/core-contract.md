# v1 Core Contract

[Back to v1 design index](../nostr-client-core-design-v1.md)

This is the minimal read-path contract for the next streets v1 PoC. It intentionally ignores old v0 UI hook shapes.

## Goals

- Make the core work before adapting the existing UI.
- Keep the API small enough to implement and validate quickly.
- Keep Nostr semantics visible: filters, relays, EOSE, cursors, replaceable events.
- Avoid old compatibility wrappers and TanStack DB-era abstractions.

## Non-Goals for the PoC

- No perfect outbox model.
- No SharedWorker/cross-tab ownership.
- No IndexedDB-first persistence.
- No production timeline UI parity.
- No reaction/repost/quote/action fanout.
- No v0 `CacheDataBase<ParsedEventPacket<T>>` compatibility.
- No generalized publish pipeline yet.

## Read Path

```txt
UI/debug caller
  ↓
QueryClient
  ↓
QueryRegistry
  ↓
NostrTransport
  ↓
IngestionPipeline
  ↓
EventStore
  ↓
FeedStateStore + Derived Views
  ↓
Solid adapters/debug UI
```

## NostrTransport

Responsibility:

- Hide `rx-nostr` from the rest of the core.
- Open/close relay subscriptions.
- Publish later, after read-path PoC.
- Surface connection/subscription events in a project-owned shape.

Minimal shape:

```ts
export interface NostrTransport {
  subscribe(request: TransportSubscribeRequest): TransportSubscription
  getSnapshot?(): TransportSnapshot
}

export interface TransportSubscribeRequest {
  filters: NostrFilter[]
  relays?: string[]
  mode: "forward" | "backward"
  closeOnEose?: boolean
  timeoutMs?: number
  onEvent(event: NostrEvent, meta: ReceivedEventMeta): void
  onEose?(relay: string): void
  onClosed?(relay: string, reason?: string): void
  onError?(error: unknown): void
}

export interface TransportSubscription {
  close(): void
}
```

Does not own:

- feed membership,
- profile derivation,
- UI loading state,
- old hook compatibility.

## EventStore

Responsibility:

- Own raw Nostr events.
- Deduplicate by event id.
- Track seen relays and received timestamps.
- Query by Nostr filters.
- Apply replaceable-event rules for derived helpers where needed.

Minimal shape:

```ts
export interface EventStore {
  putEvent(event: NostrEvent, meta?: EventStoreMeta): void
  getEvent(id: string): StoredEvent | undefined
  query(filter: NostrFilter): StoredEvent[]
  subscribe(listener: EventStoreListener): () => void
  getSnapshot(): EventStoreSnapshot
}
```

Invariants:

- Raw event body lives here, not in `FeedStateStore`.
- Derived views are projections over this store, not separate sources of truth.
- Duplicate relay deliveries update metadata but do not duplicate rows.

## FeedStateStore

Responsibility:

- Own per-feed UI/query state.
- Store event ids, order, loading state, EOSE state, cursor, errors.
- Never store event bodies.

Minimal shape:

```ts
export interface FeedStateStore {
  registerFeed(definition: EventFeedDefinition): void
  addItems(feedId: string, eventIds: string[]): void
  setStatus(feedId: string, patch: Partial<FeedStatus>): void
  getFeed(feedId: string): FeedSnapshot | undefined
  subscribe(feedId: string, listener: FeedListener): () => void
  getSnapshot(): FeedStateSnapshot
}
```

Invariants:

- Feed item membership is `eventId[]` only.
- Rendering joins `FeedStateStore` event ids with `EventStore` events.
- Loading/completion state does not depend on whether local events already exist.

## Derived Views

Responsibility:

- Provide convenient read models from raw events.
- Never fetch from relays.
- Never become authoritative storage.

PoC scope:

```ts
export interface ProfileView {
  getProfile(pubkey: string): ProfileSnapshot | undefined
  subscribeProfile(pubkey: string, listener: ProfileListener): () => void
}
```

Profile rules:

- Kind 0 events derive profile metadata.
- Newer `created_at` wins.
- Same event from another relay may update seen-relay metadata.

## QueryClient

Responsibility:

- Public core API for reads.
- Decide whether local cache is enough.
- Ask `QueryRegistry` for relay work when needed.
- Write received events into `EventStore` through ingestion.
- Update `FeedStateStore` for feed lifecycle APIs.

Minimal shape:

```ts
export interface QueryClient {
  ensureEvent(id: string, options?: EnsureOptions): QueryHandle
  ensureProfile(pubkey: string, options?: EnsureOptions): QueryHandle
  ensureEventFeed(definition: EventFeedDefinition): FeedHandle
  fetchMoreEventFeed(feedId: string): QueryHandle
  stopEventFeed(feedId: string): void
  getSnapshot?(): QueryClientSnapshot
}
```

Rules:

- `ensureEvent` and `ensureProfile` are cache warmers.
- Cache warmers do not mark feed loading complete.
- `ensureEventFeed` / `fetchMoreEventFeed` own feed lifecycle.
- UI components should call `QueryClient`, not `NostrTransport` directly.

## QueryRegistry

Responsibility:

- Own active relay work.
- Track subscription handles, listener cleanup, timeouts, and completion.
- Route events to the correct logical listener.
- Keep query debug snapshots.

PoC constraints:

- Backward/page requests are not deduped initially.
- Forward/live subscriptions may dedupe/ref-count only if the implementation stays simple.
- Batching is optional and short-window only.
- Relay planning is simple: explicit relays or default relays.

Does not own:

- raw event storage,
- feed item storage,
- derived view projection,
- UI component state.

## Debug Snapshot

Every core piece should expose enough state for `/debug/v1-core`:

```ts
export interface V1CoreDebugSnapshot {
  transport?: TransportSnapshot
  queryClient?: QueryClientSnapshot
  eventStore: EventStoreSnapshot
  feedStateStore: FeedStateSnapshot
}
```

This is not a polished devtools API. It is a PoC validation tool.
