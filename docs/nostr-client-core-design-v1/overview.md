# Nostr Client Core v1 Overview

[Back to v1 design index](../nostr-client-core-design-v1.md)

This overview describes the current streets v1 direction after the reset away from compatibility-first migration.

## Purpose

streets v1 replaces the current relay/event/query core with a project-owned Nostr-filter-first read architecture.

The goal is not to slowly preserve the v0 UI interfaces. The goal is to make the v1 core work, verify it directly, and then update the UI to match it.

## Product Context

- Browser-based Nostr client.
- SolidJS UI.
- Desktop-first multi-column experience.
- No existing user base needs compatibility protection.
- Existing repository stays; repository history should be preserved when cheap.
- Destructive code changes are acceptable when they reduce migration drag.

## Current Strategy

```txt
clean stale docs
  ↓
freeze minimal read core contract
  ↓
implement core with fake transport tests
  ↓
wire rx-nostr transport
  ↓
validate through local relay + debug route
  ↓
replace existing UI paths with v1 APIs
  ↓
delete v0 internals
```

## Key Decisions

### Keep `rx-nostr`, hide it

`rx-nostr` remains the relay communication implementation. It must be hidden behind `NostrTransport` so application code does not depend on rx-nostr APIs directly.

### EventStore is the raw event source of truth

`EventStore` owns raw Nostr events, deduplication, seen relay metadata, and Nostr-filter-first query semantics.

### FeedStateStore owns feed UI state, not event bodies

`FeedStateStore` owns feed membership by event id, loading state, EOSE/completion state, cursors, and errors. Rendering joins feed ids with `EventStore` events.

### Derived views never fetch

`ProfileView` and future derived views are projections over `EventStore`. They do not issue relay requests and are not authoritative storage.

### QueryClient is the UI-facing read API

UI and debug callers ask `QueryClient` for reads. Components do not call `NostrTransport` directly.

### QueryRegistry starts thin

The PoC `QueryRegistry` should focus on active work, cleanup, timeout, completion, and event routing.

Do not block the PoC on perfect batching, relay scoring, outbox planning, request replay cache, or cross-tab ownership.

### Debug UI validates the core first

The first browser validation target is `/debug/v1-core` with plain debug rendering. The production column UI comes later.

### TanStack DB is not the target architecture

TanStack DB-era design notes are historical references only. Do not reintroduce it as the core event/query/read-model layer.

## Initial PoC Scope

In scope:

- `NostrTransport` + `RxNostrTransport`
- memory `EventStore`
- memory `FeedStateStore`
- minimal `QueryClient`
- thin `QueryRegistry`
- `ProfileView` from kind:0 events
- debug snapshots
- `/debug/v1-core`
- plain `DebugFeedColumn`
- local deterministic seed validation

Out of scope:

- production timeline parity,
- relation/action/hover/quote fanout,
- publish pipeline,
- IndexedDB persistence,
- SharedWorker/cross-tab coordination,
- v0 hook return shape compatibility.

## Success Criteria

The v1 read PoC is successful when:

- a known local seed event can be fetched through `QueryClient`,
- the event is stored in `EventStore`,
- feed state is visible in `FeedStateStore`,
- profile metadata is derived from a kind:0 event,
- a debug feed column renders events without the old EventCache/query provider,
- active queries and store snapshots can be inspected,
- repeated local runs behave predictably.

## Related Files

- [Core Contract](./core-contract.md)
- [QueryClient / QueryRegistry Lifecycle](./query-lifecycle-ja.md)
- [Debug PoC Plan](./debug-poc.md)
- [Migration Plan](./migration-plan.md)
- [Local Development](./local-development.md)
