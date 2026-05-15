# streets Nostr Core v1 Architecture

This document is the short implementation map for `streets` v1. The full design lives in `../nostr-client-core-design-v1.md`.

## Runtime Boundary

```txt
rx-nostr
  ↓
RxNostrTransport
  ↓
NostrRepository
  ↓
Projection Pipeline
  ↓
TanStack DB Collections
  ↓
SolidJS UI
```

## Responsibilities

- `rx-nostr`: relay connections, REQ/CLOSE lifecycle, EOSE, relay queueing, reconnection, AUTH/OK/CLOSED/NOTICE handling.
- `RxNostrTransport`: application-owned adapter that hides direct `rx-nostr` usage from most code.
- `NostrRepository`: raw event source of truth, Nostr indexes, replaceable resolution, seen relay tracking, persistence.
- Projection pipeline: idempotent conversion from repository writes into UI-facing rows.
- TanStack DB: reactive read model for events, profiles, query states, timelines, relay statuses, and derived joins.
- SolidJS: UI rendering and UI-only state.

## First Milestone

Build the smallest end-to-end path before touching timelines:

1. `NostrTransport` interface and `RxNostrTransport` adapter.
2. `NostrRepository` interface and `MemoryNostrRepository`.
3. TanStack DB collections for `events`, `profiles`, and `queryStates`.
4. Profile projector for `kind:0`.
5. v1-backed `useEventByID`.
6. v1-backed `useProfile`.
7. Compatibility exports so existing imports continue to build.

## Do Not Start With

- Full timeline migration.
- IndexedDB persistence.
- Cross-tab leader election.
- Full outbox relay ranking.
- Broad deletion of legacy modules.

Those come after the event/profile path proves the architecture.
