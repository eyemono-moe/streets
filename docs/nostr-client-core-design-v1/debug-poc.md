# v1 Debug PoC Plan

[Back to v1 design index](../nostr-client-core-design-v1.md)

The first proof of v1 should be a debug route and plain debug columns, not the existing production column UI.

## Why

The existing UI contains v0 assumptions:

- legacy event cache shape,
- compatibility hook return values,
- relation/action/profile fanout,
- hover and embed side effects,
- old loading semantics.

Using it as the first validation path hides core bugs behind UI migration bugs. The debug PoC should prove the core directly.

## Route

Add a route such as:

```txt
/debug/v1-core
```

It may be ugly. It must be useful.

## Debug Page Layout

```txt
V1 Core Debug Page
  ├─ Relay/transport state
  ├─ Active query registry state
  ├─ EventStore summary
  ├─ FeedStateStore summary
  ├─ DebugFeedColumn
  ├─ DebugProfilePanel
  └─ Raw selected event/profile JSON
```

## DebugFeedColumn

Purpose:

- Render a feed from v1 `QueryClient` + `FeedStateStore` + `EventStore`.
- Avoid production `Event` component at first.
- Avoid reactions, quotes, repost counters, hover cards, and actions.

Suggested props:

```ts
interface DebugFeedColumnProps {
  feedId: string
  filter: NostrFilter
  relays?: string[]
  mode?: "liveBackfill" | "backwardOnly" | "liveOnly"
  limit?: number
}
```

Minimum UI:

- feed id,
- loading/error/EOSE/cursor state,
- event count,
- event id,
- pubkey,
- created_at,
- content,
- optional profile name if already derived,
- `Fetch more` button,
- `Stop feed` button.

## DebugProfilePanel

Suggested props:

```ts
interface DebugProfilePanelProps {
  pubkey: string
  relays?: string[]
}
```

Minimum UI:

- pubkey,
- profile loading state,
- name/display_name,
- picture,
- about,
- source kind:0 event id,
- raw profile snapshot JSON.

## DebugQueryPanel

Minimum UI:

- active query count,
- active subscription count,
- each logical request id,
- mode: forward/backward,
- filters,
- relay list,
- listener count,
- timeout/completion state,
- close button for manual cleanup if easy.

## Validation Scenarios

Start with deterministic local relay seeds.

Required scenarios:

1. Fetch one known event by id.
2. Fetch one known profile by pubkey.
3. Render a backward feed of seeded text notes.
4. Fetch more older notes.
5. Receive a live note after the feed is visible.
6. Receive duplicate event from another relay without duplicate UI rows.
7. Update a profile with a newer kind:0 event.
8. Timeout a missing event/profile request without leaving active subscriptions behind.

## Success Criteria

The debug PoC is successful when:

- debug feed renders seeded notes through v1 core only,
- profile metadata is derived from raw kind:0 events,
- `Fetch more` updates `FeedStateStore` cursor/loading state,
- active query state can be inspected while requests run,
- missing events timeout and clean up,
- the path can be run repeatedly without restarting the app,
- no old EventCache/query provider is required for this route.

## Things Intentionally Not Tested Here

- production visual design,
- full multi-column UX,
- EventActions,
- quote/repost/reaction fanout,
- hover cards,
- login flow,
- publish flow.

Those come after the read core works.
