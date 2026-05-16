# Event Feed Strategies and Query Planning

[Back to v1 design index](../nostr-client-core-design-v1.md)

Generic event feed/fetch strategy model. Timeline is only one feature-level wrapper around these primitives.

## In this file

- [Event Feed and Fetch Strategy Model](#event-feed-and-fetch-strategy-model)
- [Query Client and Query Planner](#query-client-and-query-planner)
- [Relay Selection and Traffic Reduction](#relay-selection-and-traffic-reduction)
- [Related Event Fetch Policy](#related-event-fetch-policy)

---

## Event Feed and Fetch Strategy Model

### Purpose

The generic core primitive for infinite/event-list columns is an event feed, not a timeline.

A feed definition describes:

```ts
export type EventFeedDefinition = {
  id: string
  filters: NostrFilter[]
  strategy: EventFeedStrategy
  relays?: RelaySelectionPolicy
  limit?: number
}
```

- `filters` describe what events to retrieve.
- `strategy` describes how to retrieve them.
- Feature code decides why a feed exists: home timeline, user reactions, media column, notifications, search, or a future custom column.
- The core query layer only needs to plan relay work for the definition.

### Initial Strategies

```txt
liveBackfill:
  - Fetch historical events backward with until/limit.
  - Keep a forward/live subscription for newer events.
  - Used by home timeline, user posts, user reactions, media-like columns, notifications, and many search columns.

latestOne:
  - Fetch only the newest event matching the filters.
  - Used by metadata/contact/relay-list style views and other "current value" features.

backfillOnly:
  - Fetch historical events without a long-running live subscription.
  - Used by archive/search/import views where new events are not needed.

liveOnly:
  - Subscribe only to events newer than the start point.
  - Used by temporary monitors, badges, or live-only panels.

byIds:
  - Fetch specific event ids.
  - Used by quote/reply/thread expansion and direct event references.
```

### Timeline as a Feature

A home timeline is a feature-level wrapper around an event feed:

```ts
const homeTimelineFeed = createEventFeedDefinition({
  id: "home:timeline",
  strategy: "liveBackfill",
  filters: [
    {
      kinds: [1, 6],
      authors: followees,
    },
  ],
})
```

A user's reactions can use the same strategy with different filters:

```ts
const userReactionsFeed = createEventFeedDefinition({
  id: `user:${pubkey}:reactions`,
  strategy: "liveBackfill",
  filters: [
    {
      kinds: [7],
      authors: [pubkey],
    },
  ],
})
```

This keeps the fetch/infinite machinery reusable. Avoid encoding home timeline assumptions into the core feed layer.

### `liveBackfill` Cursor Policy

A `liveBackfill` feed usually owns two request lifecycles:

```txt
forward/live request:
  - Starts near the current newest boundary.
  - Stays open until the feed is stopped or replaced.

backward request:
  - Starts at the current oldest boundary.
  - Uses until/limit for fetchMore.
  - Closes on EOSE or timeout.
```

The initial cursor state can be:

```txt
oldestCreatedAt
newestCreatedAt
hasMoreBackfill
eoseRelays
activeRelays
```

Nostr relay filters do not provide a stable event-id tie-break cursor. Start with simple `until = oldestCreatedAt - 1` behavior and repository-level dedupe. If same-second boundary gaps become a real issue, add overlap fetching or local keyset pagination using `(createdAt, eventId)` without exposing that complexity to feature columns.

### Dynamic Feed Definitions

Many feed inputs may become reactive over time:

- followee sets
- `pubkey`
- filters
- strategy
- relay policy
- local post-filter/sort options

Early iterations do not need deep special handling for signal-driven feed definitions. However, the design should not rule them out. `feedId` generation, query registry keys, and cleanup semantics should be able to handle a feed definition being replaced when a reactive input changes.

### Publish and Optimistic Updates

Publishing should also use the v1 data model. Do not keep publishing as a direct UI side effect around `rx-nostr.send()`.

Preferred flow:

```txt
UI action
  ↓
TanStack DB mutation
  ↓
optimistic event row / eventFeedItem projection
  ↓
NostrPublisher signs + sends through transport
  ↓
OK/failed status updates
  ↓
repository confirms actual event / seen relays
```

This allows compose actions, reposts, reactions, deletes, and profile/contact-list updates to appear immediately while still reconciling against repository writes and relay acknowledgements.

---

## Query Client and Query Planner

TanStack DB handles local read queries. It does not decide what to fetch from relays.

A separate query planner is still required.

### Responsibilities

```txt
QueryClient:
  - Public API for UI/features
  - ensureEventFeed
  - ensureProfile
  - ensureEventById
  - fetchMoreEventFeed
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
UI calls useEventFeed() or a feature wrapper such as useHomeTimeline()
  ↓
TanStack DB returns current local event feed rows
  ↓
createEffect calls queryClient.ensureEventFeed()
  ↓
QueryPlanner checks what is missing for the feed's filters and strategy
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

## Related Files

- [TanStack DB Data Model](./data-model.md)
- [SolidJS Integration](./solid-integration.md)
- [Runtime Architecture](./runtime-architecture.md)
