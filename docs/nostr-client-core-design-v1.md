# Nostr Client Core v1 Design Proposal

> Status: v1 planning document. This is the implementation reference for the `streets v1` Linear project.
>
> Start with the event/profile migration path. Do not begin with a full timeline rewrite.

## Purpose

This document describes the proposed architecture for replacing the core relay/event/query system of the existing Nostr client application while preserving the existing repository history and prior contributor work.

The application is a browser-based Nostr client, primarily targeting desktop usage with a TweetDeck-like multi-column UI, while remaining usable on mobile. It is built with SolidJS and already uses `rx-nostr`. The goal is to redesign the core system around `rx-nostr`, a repository layer, TanStack DB, and SolidJS integration.

This document is intended to be read by an LLM or developer before implementation. It should provide enough context to understand the intended architecture and implementation direction.

---

## High-Level Requirements

- Runs in the browser.
- Desktop-first UI, but mobile should remain usable.
- TweetDeck-like multi-column layout.
- Minimize relay traffic and duplicated subscriptions.
- Prioritize performance.
- Use SolidJS as the UI framework.
- Continue development in the existing repository instead of creating a new repository from scratch.
- Preserve prior contributor work as much as possible in code history and file structure.
- Continue using `rx-nostr` for relay communication and subscription lifecycle management.
- Use TanStack DB as the reactive read-model layer between the repository and SolidJS UI.
- Support local development with Docker-based local relays and asset server, including deterministic seed scenarios and edge-case testing.
- Eventually automate NIP update tracking and LLM-generated PRs.
- Support a VitePlus-based development workflow after the migration has been researched.
- Provide Nostr-development-focused skills and commands so agents can run repeatable local relay, seed, and NIP workflows.

---


## Additional Workstreams Not Covered by the Core Diagram

The core architecture diagram is only the runtime event/query architecture. The v1 project also includes supporting workstreams that should be planned as separate PRs or Linear issues.

### VitePlus Development Environment

`streets` should move from plain Vite scripts to a VitePlus-based workflow after a short migration investigation. Use `noir-note` as the nearest reference implementation. The first task is research/planning only; do not block the Nostr core work on this migration.

Expected outcomes:

- Identify the smallest safe VitePlus migration path.
- Compare current `vite.config.ts`, `package.json`, `tsconfig*`, Biome, and test scripts with `noir-note`.
- Decide whether the migration should be automated by the VitePlus migrate command or done manually.
- Keep existing validation commands working until the migration PR lands.

### Nostr Development Skills and Commands

The project should gain repeatable commands and agent skills for Nostr-specific development. These should cover local relays, seed scenarios, event generation, relay edge cases, and NIP impact review.

Examples:

- Start/reset local relay scenarios.
- Generate deterministic Nostr events from fixed keys and timestamps.
- Push seed events to selected local relays.
- Inspect relay behavior such as delayed EOSE, duplicates, CLOSED, AUTH, and low `max_subscriptions`.
- Run a NIP impact checklist against parser, repository, projection, and UI layers.

### NIP Update Detection and LLM PR Automation

Add automation that tracks `nostr-protocol/nips`, compares changes against a stored snapshot, and asks an LLM to create either an issue or a PR depending on confidence. NIP markdown files are the primary source of truth. Third-party summaries are non-authoritative.

This automation should start conservative: create impact reports and issues before allowing generated implementation PRs.

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
  - timelineItems
  - queryStates
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
    timeline.ts
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
  use-timeline.ts
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
  - New timeline events
  - Long-running column subscription
```

A single timeline column may use both:

```txt
Home timeline column:
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

### `timelineItems`

A UI-facing timeline item projection. This should not duplicate raw events.

```ts
export type TimelineItemRow = {
  id: string
  timelineId: string
  eventId: string
  pubkey: string
  kind: number
  createdAt: number
  insertedAt: number

  reason:
    | "home"
    | "profile"
    | "mention"
    | "reply"
    | "search"
    | "list"

  score?: number
}
```

Suggested id:

```ts
const timelineItemId = `${timelineId}:${eventId}`
```

This allows the same event to appear in multiple columns/timelines without duplicating the event row itself.

### `queryStates`

Tracks fetch/live status for UI queries.

```ts
export type QueryStateRow = {
  id: string
  status: "idle" | "loading" | "live" | "error"
  error?: string
  oldestCreatedAt?: number
  newestCreatedAt?: number
  eoseRelays: string[]
  activeRelays: string[]
  updatedAt: number
}
```

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

  await projectIntoActiveTimelines(event, ctx)
}
```

Projection should be idempotent.

---

## SolidJS Integration

### Main Rule

Do not store the entire raw event graph in Solid's `createStore`.

Solid state should hold UI-only state.

Use TanStack DB live queries for event/profile/timeline data.

### Solid Store Should Hold

```txt
- Column layout
- Selected column
- Dialog open/close state
- Compose draft state
- Drag state
- Local UI preferences
- View-local ephemeral state
```

### Solid Store Should Not Hold

```txt
- Full raw event map
- Full tag indexes
- Full author indexes
- Replaceable event index
- Relay seen info
- Large profile maps
- IndexedDB cache internals
```

### Column and Event Renderer Migration Boundaries

The current UI has two important legacy entry points:

```txt
src/features/Column/components/ColumnContent.tsx
src/shared/components/Event.tsx
src/shared/components/EventByID.tsx
src/shared/components/InfiniteEvents.tsx
src/shared/libs/query.ts
```

For v1, keep `ColumnContent` and the individual column components as UI composition and layout owners. A column should describe what timeline/query it needs, but it should not directly create `rx-nostr` requests, parse relay packets, or write cache data. Column-local Solid state should remain limited to layout, temporary column state, dialogs, and view-local controls.

Event renderers should become read-model consumers. `EventByID` should resolve an event row through the v1 Solid hook, then pass a parsed/renderable view model into `Event`. `Event` may continue to dispatch by event kind, but it should not fetch related events or mutate the repository. Rendering unknown events from the raw event row is acceptable as a fallback.

The migration path should preserve compatibility exports so existing call sites can move gradually:

```txt
legacy column component
  ↓ describes timeline/query params
v1 hook ensures query through QueryClient
  ↓ reads TanStack DB live query
EventByID / InfiniteEvents render read-model rows
```

### Filter Issuance Policy

Relay filters should be issued only by the v1 query layer:

```txt
UI / column params
  ↓
QueryClient.ensure* API
  ↓
QueryPlanner creates filters, relay choices, chunking, and priorities
  ↓
QueryRegistry reuses or reference-counts active work
  ↓
RxNostrTransport emits filters
```

Do not emit filters directly from column components, event renderers, projectors, or TanStack DB collection code. This prevents duplicate subscriptions across columns and keeps relay traffic policy testable.

`cacheAndEmitRelatedEvent`-style behavior should be replaced by explicit related-event policy. Related event fetches may still be triggered, but only through `QueryClient`/`RelatedEventPolicy`, with clear reasons such as reply context, quoted event preview, repost source, or profile metadata. Projectors should record relationships into read models; they should not perform network fetches.

### Timeline Hook Sketch

```tsx
function useTimeline(params: Accessor<TimelineParams>) {
  const client = useNostrClient()

  createEffect(() => {
    client.queryClient.ensureTimeline(params())
  })

  return useLiveQuery((q) =>
    q
      .from({ item: timelineItemsCollection })
      .where(({ item }) => item.timelineId === timelineId(params()))
      .orderBy(({ item }) => item.createdAt, "desc")
      .limit(params().limit),
  )
}
```

### Timeline Component Sketch

```tsx
function TimelineColumn(props: { timelineId: string }) {
  const items = useLiveQuery((q) =>
    q
      .from({ item: timelineItemsCollection })
      .where(({ item }) => item.timelineId === props.timelineId)
      .orderBy(({ item }) => item.createdAt, "desc")
      .limit(100),
  )

  return (
    <For each={items.data}>
      {(item) => <NoteRow eventId={item.eventId} />}
    </For>
  )
}
```

### Note Row Sketch

```tsx
function NoteRow(props: { eventId: string }) {
  const row = useLiveQuery((q) =>
    q
      .from({ event: eventsCollection })
      .leftJoin(
        { profile: profilesCollection },
        ({ event, profile }) => event.pubkey === profile.pubkey,
      )
      .where(({ event }) => event.id === props.eventId),
  )

  return <NoteView row={row.data?.[0]} />
}
```

---

## Query Client and Query Planner

TanStack DB handles local read queries. It does not decide what to fetch from relays.

A separate query planner is still required.

### Responsibilities

```txt
QueryClient:
  - Public API for UI/features
  - ensureTimeline
  - ensureProfile
  - ensureEventById
  - fetchMore
  - startLiveQuery
  - stopQuery

QueryPlanner:
  - Convert app-level query into relay requests
  - Choose relays
  - Merge filters
  - Chunk large filters
  - Assign priorities
  - Avoid duplicate active subscriptions

QueryRegistry:
  - Reuse active queries across columns
  - Reference count query usage
  - Release unused queries
```

### Query Flow

```txt
UI calls useTimeline()
  ↓
TanStack DB returns current local timeline rows
  ↓
createEffect calls queryClient.ensureTimeline()
  ↓
QueryPlanner checks what is missing
  ↓
RxNostrTransport subscribes/fetches if needed
  ↓
Events enter repository and projection pipeline
  ↓
TanStack DB live query updates UI
```

---

## Relay Selection and Traffic Reduction

### Principles

- Use default relays initially.
- Add NIP-65 outbox model after the basic pipeline works.
- Avoid issuing duplicate subscriptions for multiple columns.
- Merge similar filters before passing to `rx-nostr`.
- Use `rx-nostr` batch/chunk operators where appropriate.
- Do not manually manage relay-level subscription capacity. Let `rx-nostr` handle NIP-11 based queuing.

### Outbox Levels

Implement gradually:

```txt
Level 1:
  Use default relays only.

Level 2:
  Use author write relays from NIP-65 relay list metadata.

Level 3:
  Rank relays by success rate, latency, and duplication rate.

Level 4:
  Use stricter relay limits on mobile.
```

### Request Policy Sketch

```ts
export type ReqPolicy = {
  debounceMs: number
  merge: MergeFilter
  shouldChunk: (filters: LazyFilter[]) => boolean
  chunk: (filters: LazyFilter[]) => LazyFilter[][]
  priority: "visible" | "near-visible" | "background"
}
```

---

## Related Event Fetch Policy

Do not fetch related events as an unconditional side effect of every received event.

Instead, define a policy system.

```ts
export type RelatedFetchPriority =
  | "visible"
  | "near-visible"
  | "background"
  | "disabled"
```

Examples:

```txt
Visible note row:
  - Fetch author profile
  - Fetch reactions/reposts if counters are visible
  - Fetch quoted event if visible

Near-visible note row:
  - Fetch author profile
  - Maybe fetch quoted event

Background event:
  - Store only
  - Do not fetch secondary data unless policy says so
```

Related event fetches should go through `QueryClient`, not directly call `rx-nostr` from projectors.

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

## Local Development Environment

The project should support deterministic local development with Docker-based relays and an asset server.

Existing Docker relay/asset-server setup should be kept and extended, not replaced.

### Desired Commands

```json
{
  "scripts": {
    "dev:env": "docker compose -f dev/docker-compose.yml up",
    "dev:reset": "tsx dev/seeds/reset.ts",
    "dev:seed": "tsx dev/seeds/push.ts basic",
    "dev:seed:all": "tsx dev/seeds/push.ts all",
    "dev:seed:heavy": "tsx dev/seeds/push.ts heavy-timeline",
    "dev:e2e": "pnpm dev:reset && pnpm dev:seed:all && playwright test"
  }
}
```

### Local Relay Setup

Use multiple local relays, not just one.

```txt
relay-a:
  Normal relay.

relay-b:
  Slow or partial relay.
  Some events are intentionally missing.
  EOSE may be delayed.

relay-c:
  Strict relay.
  Small max_subscriptions.
  Small max_limit.
  AUTH/CLOSED behavior can be tested.
```

Example NIP-11 limitation for a strict relay:

```json
{
  "name": "local limited relay",
  "supported_nips": [1, 11],
  "limitation": {
    "max_subscriptions": 1,
    "max_limit": 50
  }
}
```

This is useful for confirming that `rx-nostr` queue behavior works correctly under low subscription limits.

### Asset Server

The local asset server should provide both normal and broken assets.

Suggested endpoints:

```txt
/assets/avatar/alice.png
/assets/avatar/bob.png
/assets/avatar/broken.png
/assets/avatar/slow.png?delay=3000
/assets/avatar/large.jpg
/assets/avatar/404.png
/assets/banner/alice.png
```

Use this to test:

```txt
- Normal avatar loading
- 404 images
- Slow images
- Large images
- Broken files
- CORS behavior
- blurhash fallback
```

---

## Seed Scenario Design

Seed data should be deterministic.

Use fixed keys, fixed timestamps, and stable event parameters so event ids remain stable between runs.

### Suggested Directory

```txt
dev/seeds/
  scenarios/
    basic.ts
    heavy-timeline.ts
    relay-edge-cases.ts
    replaceable-events.ts
    timeline-edge-cases.ts
    asset-edge-cases.ts
    deletion.ts
  keys.ts
  generate.ts
  push.ts
  reset.ts
```

### Seed DSL Sketch

```ts
const alice = user("alice")
const bob = user("bob")

scenario("basic", ({ event, relay, asset }) => {
  asset.image("alice-avatar", "avatars/alice.png")

  event.metadata(alice, {
    name: "Alice",
    picture: asset.url("alice-avatar"),
  })

  event.contacts(me, [alice, bob])

  event.note(alice, {
    content: "hello",
    relays: ["relay-a", "relay-b"],
  })

  event.reply(bob, {
    root: "alice-note-1",
    content: "reply",
    relays: ["relay-b"],
  })
})
```

### Scenario: `basic`

Should include:

```txt
- Self user
- 5 followees
- kind:0 metadata
- kind:3 contact list
- kind:1 note
- Reply
- Repost
- Reaction
- Quote
```

### Scenario: `relay-edge-cases`

Should include:

```txt
- Event only on relay A
- Event only on relay B
- Same event duplicated across relays
- Slow EOSE relay
- Relay returning CLOSED
- AUTH-required relay
- Relay with max_subscriptions = 1
```

### Scenario: `replaceable-events`

Should include:

```txt
- Old kind:0 metadata
- New kind:0 metadata
- Old kind:3 contact list
- New kind:3 contact list
- kind:10002 relay list metadata
- Parameterized replaceable events
```

### Scenario: `timeline-edge-cases`

Should include:

```txt
- Events with same created_at
- Future created_at event
- Very old event
- High-volume author
- Muted user
- Deleted event
- Reply target missing
- Quote target only available on another relay
```

### Scenario: `asset-edge-cases`

Should include:

```txt
- Valid avatar
- 404 avatar
- Slow avatar
- Huge image
- Broken image
- Image with blurhash
- Image without blurhash
```

---

## Migration Strategy for Existing Repository

The existing repository should be preserved. Do not rewrite from scratch in a new repository.

### Preserve Contributor Work

Prefer:

- `git mv` when moving files.
- Keeping legacy public APIs as compatibility wrappers.
- Refactoring old modules into facades instead of deleting them immediately.
- Small, reviewable PRs.
- Clear migration comments.

Avoid:

- Deleting large existing files and replacing them with unrelated new files in one PR.
- Moving everything at once.
- Rewriting history.
- Creating a new repository unless absolutely necessary.

### Legacy Compatibility Layer

Existing files such as query helpers or event cache modules can become compatibility layers.

```ts
/**
 * Legacy query API.
 *
 * Kept to preserve existing call sites and migration history.
 * New code should import from src/core/query or feature hooks.
 */
export { useProfile } from "@/features/profile/useProfile"
export { useEventByID } from "@/features/event/useEventByID"
```

This preserves code-level continuity while allowing the new core to take over.

---

## Suggested PR Plan

### PR 1: Architecture Documents

Add:

```txt
docs/architecture/nostr-core-v1.md
docs/architecture/rx-nostr-boundary.md
docs/architecture/local-dev-seeding.md
```

No behavior change.

### PR 2: Transport Boundary

Add:

```txt
src/core/transport/transport.ts
src/core/transport/rx-nostr-transport.ts
```

Keep existing provider and hooks working.

### PR 3: Repository Interface and Memory Implementation

Add:

```txt
src/core/repository/nostr-repository.ts
src/core/repository/memory-repository.ts
```

Add unit tests.

### PR 4: TanStack DB Collections

Add:

```txt
src/core/db/schema.ts
src/core/db/collections.ts
src/core/db/projectors/*
```

Implement projection from repository writes into collections.

### PR 5: Solid Provider

Add:

```txt
src/core/solid/provider.tsx
```

This provider should create and expose:

```txt
- transport
- repository
- collections
- queryClient
```

### PR 6: Migrate `useEventByID`

Migrate the simplest event fetch hook first.

Keep the old export path as a compatibility wrapper.

### PR 7: Migrate `useProfile`

Migrate profile metadata to repository + TanStack DB projection.

### PR 8: Migrate Contact List / Followees

Migrate `kind:3` handling and followee queries.

### PR 9: Migrate Timeline

Migrate timeline queries to:

```txt
QueryClient.ensureTimeline()
  ↓
rx-nostr transport fetch/live subscription
  ↓
repository
  ↓
TanStack DB timelineItems
  ↓
Solid live query
```

### PR 10: Related Event Policy

Move related event fetching out of unconditional event-cache side effects.

### PR 11: IndexedDB Repository

Add persistent repository implementation.

### PR 12: Local Seed Scenarios

Add deterministic local seed tooling and edge-case scenarios.

### PR 13: Cleanup Legacy Internals

Turn old modules into thin wrappers or remove only truly dead code.

---

## Implementation Order Inside the New Core

Recommended development order:

```txt
1. Define NostrRepository interface.
2. Implement MemoryNostrRepository.
3. Define TanStack DB collections.
4. Implement repository → collection projectors.
5. Implement RxNostrTransport.
6. Wire EVENT → repository → projector.
7. Implement useEventByID with TanStack DB live query.
8. Implement useProfile with TanStack DB live query.
9. Implement contact list and relay list projections.
10. Implement QueryClient and QueryRegistry.
11. Implement timeline backfill.
12. Implement timeline live subscription.
13. Add local relay seed scenarios.
14. Add IndexedDB repository.
15. Add cross-tab improvements.
```

Do not start with the timeline. Start with `useEventByID` and `useProfile`, then move to timeline.

---

## Testing Strategy

### Unit Tests

Test:

```txt
- Repository deduplication
- Replaceable event resolution
- Parameterized replaceable event resolution
- Tag index lookup
- Seen relay tracking
- Projection idempotency
- Timeline item insertion
- Query registry reference counting
- Filter merge behavior
```

### Integration Tests

Use local relays and seed data.

Test:

```txt
- Initial home timeline load
- Infinite scroll
- Live event arrival
- Profile metadata update
- Duplicate event across relays
- Missing quote target
- Late EOSE
- Low max_subscriptions relay
- AUTH/CLOSED behavior where possible
```

### UI Tests

Use deterministic seed scenarios.

Test:

```txt
- Multi-column layout
- Timeline rendering
- Profile rendering
- Reaction/repost counters
- Quote/reply rendering
- Asset fallback
- Loading states
- Error states
```

---

## NIP Update Automation

Later, add automation for tracking NIP changes.

### Desired Flow

```txt
Scheduled GitHub Actions workflow
  ↓
Fetch nostr-protocol/nips
  ↓
Compare with previous snapshot
  ↓
Generate NIP impact report
  ↓
If confidence is high, create implementation PR
  ↓
If confidence is low, create issue only
```

### Impact Report Format

```md
## NIP Impact Report

- Changed NIPs:
- Affected event kinds:
- Affected tags:
- Affected client messages:
- Affected relay behavior:
- Parser changes:
- Repository/index changes:
- Projection changes:
- Migration required:
- Test updates:
- Confidence:
```

The LLM should treat NIP markdown files as primary sources. Third-party summaries should not be used as authoritative sources.

---

## Key Design Decisions

### Decision 1: Keep `rx-nostr`

Do not replace `rx-nostr` with a custom WebSocket/subscription implementation.

Reason:

```txt
rx-nostr already handles NIP-11-aware subscription queueing,
REQ/CLOSE lifecycle, EOSE handling, lazy connection,
reconnection, AUTH, and relay status monitoring.
```

### Decision 2: Introduce a Transport Adapter

Hide `rx-nostr` behind `NostrTransport` so the rest of the application is not tightly coupled to `rx-nostr` APIs.

### Decision 3: Repository Is the Raw Event Source of Truth

The repository owns raw events, Nostr-specific indexes, seen relay tracking, and persistence.

### Decision 4: TanStack DB Is the UI Read Model

TanStack DB collections are derived from repository writes and used by SolidJS live queries.

### Decision 5: Solid Store Is Only for UI State

Do not put the full event graph or indexes into Solid's `createStore`.

### Decision 6: Preserve Existing Repository History

Do not create a new repository. Do not delete old files immediately. Use compatibility wrappers and `git mv` where possible.

### Decision 7: Seed Local Edge Cases

Local development must include deterministic relay and asset scenarios for edge cases, not just happy-path demo data.

---

## Non-Goals

For the initial implementation, do not attempt to solve:

```txt
- Perfect outbox model relay selection
- Full cross-tab leader election
- SharedWorker relay connection ownership
- Complete NIP automation
- Full offline-first sync semantics
- All NIP support
- Advanced ranking algorithms
```

These can be added after the basic architecture is stable.

---

## Initial Minimal Milestone

The first milestone should be small and prove the architecture.

### Scope

```txt
- RxNostrTransport
- MemoryNostrRepository
- TanStack DB collections: events, profiles, queryStates
- Projection for kind:0 profile events
- useEventByID
- useProfile
- Existing UI still works through compatibility exports
```

### Success Criteria

```txt
- Existing app still builds.
- Existing imports do not need large-scale rewrites.
- A received event is written to repository.
- The event is projected into TanStack DB.
- Solid UI updates through live query.
- Profile metadata updates correctly when newer kind:0 arrives.
- Duplicate relay events do not duplicate UI rows.
```

---

## Final Target Shape

```txt
SolidJS UI
  ↓
Feature hooks
  - useTimeline
  - useProfile
  - useEventByID
  - useNotifications
  ↓
TanStack DB live queries
  ↓
TanStack DB collections
  ↓
Projection pipeline
  ↓
NostrRepository
  ↓
RxNostrTransport
  ↓
rx-nostr
  ↓
Nostr relays
```

The implementation should preserve the existing repository and gradually move behavior behind the new core. The old API surface can remain as compatibility wrappers until all feature code has migrated.
