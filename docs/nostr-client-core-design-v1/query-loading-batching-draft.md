# Query loading and batching draft

Temporary design memo for streets v1 query/loading/batching discussion.

Status: historical draft. Do not treat this as current architecture. Current guidance lives in the root index, `core-contract.md`, `query-lifecycle-ja.md`, and `debug-poc.md`.

## Context

The current v1 core direction separates raw event storage, feed membership/loading state, and relay query lifecycle:

```txt
rx-nostr
  ↓
RxNostrTransport
  ↓
QueryClient / QueryRegistry
  ↓
EventStore + FeedStateStore + derived views
  ↓
SolidJS UI
```

Recent design questions:

- How necessary is `FeedStateStore`, and how wide should its responsibility be?
- How should `QueryClient` and `QueryRegistry` boundaries be drawn?
- Can feed loading and per-item auxiliary loading use similar semantics/API?
- How should multiple-filter backward batching manage loading/completion?
- How much can rx-nostr `subId` help with batch/listener routing?

## Current recommended direction

### Keep FeedStateStore, but keep its scope narrow

`FeedStateStore` should remain because raw events can belong to many feeds while each feed has independent UI state.

```txt
event X
  belongs to home timeline
  belongs to alice profile posts
  belongs to a search column
  belongs to a thread/replies view
```

The event itself is stored once in `EventStore`; feed membership and feed-specific lifecycle belong to `FeedStateStore`.

`FeedStateStore` owns:

- `feedId -> eventIds`
- feed-specific ordering
- initial/page loading state
- live state
- cursors (`oldestCreatedAt`, `newestCreatedAt`)
- `hasMoreBackfill`
- feed-specific EOSE/active relay state
- feed-specific errors

`FeedStateStore` must not own:

- raw event truth
- relay request issuance
- filter planning
- subscription batching/deduplication
- profile/contact/reaction source-of-truth state

### QueryClient vs QueryRegistry

Use this split:

```txt
QueryClient:
  UI/hooks-facing public API and stable semantics.

QueryRegistry:
  transport-facing lifecycle engine: subscriptions, batching, dedupe,
  reference counts, listener routing, timeout/complete handling.
```

Public-ish API shape:

```ts
queryClient.ensureEvent(...)
queryClient.ensureProfile(...)
queryClient.ensureEventRelations(...)

queryClient.ensureEventFeed(...)
queryClient.fetchMoreEventFeed(...)
queryClient.stopEventFeed(...)
```

`ensureEvent`, `ensureProfile`, and `ensureEventRelations` are auxiliary cache warmers. They should check local stores/views and, if missing, request relay data so the EventStore eventually updates.

They are not feed lifecycle APIs and should not mark feed loading complete.

`ensureEventFeed` and `fetchMoreEventFeed` are feed lifecycle APIs. They update `FeedStateStore` membership, loading state, cursors, and `hasMoreBackfill`.

## Loading semantics

Try to align per-item auxiliary loading and feed loading with TanStack Query / Infinite Query style semantics.

Shared base:

```ts
type QueryStatus = "idle" | "pending" | "success" | "error"
type FetchStatus = "idle" | "fetching" | "paused"

type LoadState = {
  status: QueryStatus
  fetchStatus: FetchStatus
  error?: unknown
  startedAt?: number
  updatedAt?: number
}
```

Auxiliary query state:

```ts
type AuxiliaryQuerySnapshot<T> = LoadState & {
  queryKey: QueryKey
  data?: T
}
```

Feed query state extends the same idea:

```ts
type EventFeedSnapshot = LoadState & {
  feedId: string
  eventIds: readonly string[]

  hasNextPage: boolean
  isFetchingNextPage: boolean
  nextPageError?: unknown

  liveStatus: "idle" | "connecting" | "live" | "closed" | "error"

  oldestCreatedAt?: number
  newestCreatedAt?: number
  eoseRelays: readonly string[]
  activeRelays: readonly string[]
}
```

This preserves similar semantics:

```txt
query:
  status / fetchStatus / error / data

infinite event feed:
  status / fetchStatus / error / eventIds
  + fetchMore
  + page cursor
  + hasNextPage
  + live subscription status
```

## rx-nostr 3.5.0 subId findings

rx-nostr exposes `subId` on incoming packets:

```ts
type EventPacket = { subId: string; event: Nostr.Event; ... }
type EosePacket = { subId: string; ... }
type ClosedPacket = { subId: string; notice: string; ... }
```

`createRxBackwardReq(rxReqId?)` and `createRxForwardReq(rxReqId?)` accept an optional `rxReqId`.

Internally rx-nostr constructs subscription ids as:

```ts
subId = `${rxReqId}:${childId}`
childId = strategy === "backward" ? emitIndex : 0
```

Implications:

- We can choose an `rxReqId` that acts like a batch id.
- We can route EVENT/EOSE/CLOSED packets to a physical batch by `subId`.
- We cannot know which filter inside a multi-filter REQ matched from `subId` alone.
- For a multi-filter REQ, the client must run `eventMatchesFilter(event, listener.filter)` before delivering to logical listeners.

## Backward batching model

Recommended initial batching scope:

Batch only auxiliary backward cache warmers:

- `ensureEvent`
- `ensureProfile`
- `ensureEventRelations`

Do not batch these into the same mechanism initially:

- `fetchMoreEventFeed`
- `ensureEventFeed` initial backfill
- forward/live feed subscriptions

Reason: feed requests update visible feed lifecycle state and cursors. Auxiliary warmers only populate EventStore/derived views and are easier to batch safely.

### Physical batch vs logical listener

Model one flushed batch as one physical backward request with many logical listeners.

```ts
type BackwardBatch = {
  batchId: string
  subId: string
  relays: RelayPolicy
  listeners: Map<ListenerId, BackwardListener>
  timeoutId: number
}

type BackwardListener = {
  id: ListenerId
  filter: NostrFilter
  kind: "event" | "profile" | "relations"
  closeOnFirstEvent: boolean
  onEvent: (packet: EventPacket) => void
  onComplete: (reason: CompleteReason) => void
  matchedCount: number
}
```

EVENT routing:

```ts
function onEvent(packet: EventPacket) {
  const batch = batchesBySubId.get(packet.subId)
  if (!batch) return

  for (const listener of batch.listeners.values()) {
    if (!eventMatchesFilter(packet.event, listener.filter)) continue

    listener.matchedCount++
    listener.onEvent(packet)

    if (listener.closeOnFirstEvent) {
      completeListener(listener, "matched")
    }
  }

  if (batch.listeners.size === 0) {
    closeUnderlyingRequest(batch)
  }
}
```

EOSE routing:

```ts
function onEose(packet: EosePacket) {
  const batch = batchesBySubId.get(packet.subId)
  if (!batch) return

  batch.eoseRelays.add(packet.from)

  if (allTargetRelaysFinished(batch)) {
    for (const listener of batch.listeners.values()) {
      completeListener(listener, "eose")
    }
    closeUnderlyingRequest(batch)
  }
}
```

Important distinction:

```txt
listener completion:
  QueryRegistry-level lifecycle: matched event, EOSE, timeout, explicit close.

feed completion:
  FeedStateStore-level UI lifecycle: page finished, no more backfill, live closed/error.
```

Do not treat batched cache-warmer EOSE as feed completion.

### Do not merge filters initially

Prefer emitting an array of filters instead of merging them.

Unsafe merge example:

```ts
{ authors: [alice], kinds: [0], limit: 1 }
{ authors: [bob], kinds: [0], limit: 1 }
```

Merging into this is dangerous:

```ts
{ authors: [alice, bob], kinds: [0], limit: 1 }
```

The `limit: 1` applies to the whole REQ and can drop one profile.

Prefer:

```ts
[
  { authors: [alice], kinds: [0], limit: 1 },
  { authors: [bob], kinds: [0], limit: 1 },
]
```

The relay sees one REQ with multiple filters; QueryRegistry routes returned events to listeners by client-side filter matching.

### Matching rules

`eventMatchesFilter` should share semantics with EventStore query filtering:

- filter array is OR
- fields inside one filter are AND
- ids/authors/kinds/tag values are OR within that field
- `since` / `until` are event-level checks
- `limit` is not an event-level match predicate
- `search` and lazy/function-valued `since`/`until` should be excluded from batching or handled conservatively

### Initial batch window

Use a short window, initially around 32-50ms.

Same-tick batching may miss virtual-scroll/onMount bursts across frames. A 1s window reduces subscription pressure but can make visible auxiliary data feel sluggish.

Batch key should include:

- mode = backward auxiliary warmer
- relay policy (`relays`, `defaultReadRelays`)
- possibly priority/visibility later



## Existing library design notes from official docs

Sources checked:

- Applesauce docs: https://applesauce.build/
  - Event Store: https://applesauce.build/core/event-store.html
  - Models: https://applesauce.build/core/models.html
  - Loaders: https://applesauce.build/loading/loaders/package.html
  - Event Loader: https://applesauce.build/loading/loaders/event-loader.html
  - Timeline Loader: https://applesauce.build/loading/loaders/timeline-loader.html
- NDK docs: https://nostr-dev-kit.github.io/ndk/
  - Subscription Management: https://nostr-dev-kit.github.io/ndk/tutorial/subscription-management.html
  - Subscription Lifecycle internals: https://nostr-dev-kit.github.io/ndk/internals/subscriptions.html
  - Local-first: https://nostr-dev-kit.github.io/ndk/tutorial/local-first.html

### Applesauce

Applesauce has a clean split that maps well to the proposed streets v1 split:

```txt
EventStore:
  reactive event database / source of event truth

Models:
  derived observable state from EventStore
  explicitly do not fetch from relays

Loaders:
  relay/cache loading helpers
  batch, deduplicate, follow relay hints, and push events into EventStore
```

Useful reference points:

- The docs recommend one app-level `EventStore`.
- `EventStore` handles event deduplication, replaceable/addressable replacement, delete events, and observable subscriptions.
- Models are cached by argument and reused for similar derived subscriptions.
- Models do not fetch; they only react to events already in the store.
- Loaders provide request batching and event deduplication and can work with any relay connection pool.
- `createEventLoader` batches single-event requests with `bufferTime` and `bufferSize`, supports `cacheRequest`, relay hints, and `extraRelays`.
- `createTimelineLoader` is stateful and paginated. Repeated calls load older blocks, and timeline windows can request missing ranges.
- Timeline loader can read cache alongside relays and can use outbox maps for relay selection.

Implications for streets:

- Keep `EventStore` as raw event truth.
- Keep feed/member lifecycle separate from raw event truth; Applesauce `TimelineModel` is derived from EventStore, while its timeline loader is a distinct stateful loading primitive.
- Keep auxiliary loading as cache warmer / store population, not as model state mutation beyond writing events.
- Prefer app-level loader/query services instead of scattered component-level relay calls.
- A `FeedStateStore` is still justified because streets needs UI feed lifecycle (`hasNextPage`, cursors, live status), not only a derived timeline array.

### NDK

NDK is more integrated, but its subscription docs are useful for lifecycle and batching language.

Useful reference points:

- NDK groups similar subscriptions to avoid hitting relays with too many REQs.
- Default grouping window is short; docs mention a 100ms default grouping window and configurable `groupingDelay`.
- `groupingDelayType` has `at-least` and `at-most` semantics.
- NDK distinguishes top-level application `NDKSubscription` from per-relay `NDKRelaySubscription`.
- A top-level subscription can still be logically active after a per-relay subscription closed after EOSE.
- Events from relay-level subscriptions are dispatched through a top-level subscription manager to all interested subscriptions.
- For author filters, NDK may split a logical subscription into relay-specific filters based on the outbox model.
- `relayGoalPerAuthor` controls redundancy vs bandwidth for author relay selection.
- Local-first mode depends on a cache adapter and treats failed publishing/UI handling as application concerns.

Implications for streets:

- The proposed `QueryClient` / `QueryRegistry` split mirrors NDK's public subscription vs internal relay subscription manager split.
- It is valid for one logical query/feed to map to multiple physical relay requests and for one physical request to serve multiple logical listeners.
- Do not conflate physical EOSE with logical query/feed completion. Track completion at the appropriate layer.
- A short batching window is established practice. For streets, 32-50ms may feel better for visible auxiliary data than NDK's generic 100ms default, but 100ms is a defensible upper baseline.
- Outbox-aware relay planning belongs in query planning/registry, not in UI components.
- Keep relay-specific lifecycle and logical listener lifecycle separate in the types.

### Resulting adjustment to the recommended design

The current draft direction still looks sound, with these refinements:

1. Name the boundaries after responsibilities, not mechanisms:
   - `EventStore`: raw event truth and indexes.
   - `FeedStateStore`: visible feed membership and UI lifecycle.
   - `QueryClient`: public API used by hooks/components.
   - `QueryRegistry`: internal logical query/listener lifecycle and batching.
   - `RelayRequestPlanner` or equivalent: relay/filter planning, including outbox later.

2. Use Applesauce's separation as the main reference:
   - models/derived views do not fetch;
   - loaders fetch and populate stores;
   - timeline loading is stateful and separate from raw event storage.

3. Use NDK's lifecycle terminology as the caution:
   - logical query lifecycle != physical relay subscription lifecycle;
   - per-relay EOSE != feed complete;
   - grouping delay/batching is normal, but must preserve listener-level semantics.

4. Do not copy either library wholesale.
   streets is Solid/rx-nostr focused and should keep a smaller project-owned core. Existing libraries are references for boundaries and lifecycle pitfalls, not drop-in architecture.

## Open questions

- Should missing auxiliary data after EOSE be represented as `success + data undefined`, or should we introduce an explicit `notFound`/`miss` result?
- Should auxiliary query state be persisted/observable, or internal-only for now?
- Should `FeedStateStore.status` be migrated from `"loading" | "live" | "complete"` to Query-like `status` + `fetchStatus` fields?
- How should partial relay EOSE/timeout be represented for feeds with multiple relays?
- Can NDK or applesauce provide a better naming/API pattern for this split?
