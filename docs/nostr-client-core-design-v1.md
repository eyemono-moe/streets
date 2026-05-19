# Nostr Client Core v1

> Status: current v1 direction.
>
> v1 is a speed-first destructive migration. There are no existing users to protect, so compatibility with the old v0 UI interfaces is not a goal.

This is the entrypoint for the current streets v1 core work. Keep this file short and authoritative.

## Current Direction

```txt
Design the minimal ideal core
  ↓
Build a working read-path PoC
  ↓
Verify it through debug routes/columns, not the existing column UI
  ↓
Harden local deterministic validation
  ↓
Update or replace the existing UI to match the v1 core API
  ↓
Delete v0 cache/query/provider paths
```

## Non-Negotiables

1. Do not shape v1 core APIs around old v0 hook return values.
2. Do not preserve compatibility wrappers unless they are part of a short-lived removal PR.
3. Do not use the existing column UI as the first proof that the core works.
4. Do not reintroduce TanStack DB as the target core data architecture.
5. Do not start with a full home timeline rewrite.
6. Do keep `rx-nostr` behind a project-owned `NostrTransport` boundary.
7. Do make local deterministic debug validation part of the implementation, not an afterthought.

## Minimal Core Shape

Read path:

```txt
rx-nostr
  ↓
RxNostrTransport
  ↓
QueryClient / QueryRegistry
  ↓
EventStore
  ↓
FeedStateStore + Derived Views
  ↓
Debug UI first, then production Solid UI
```

Write path is later:

```txt
Solid UI
  ↓
PublishPipeline
  ↓
NostrTransport
  ↓
optimistic local event + per-relay publish state
  ↓
EventStore / Derived Views
```

Publish is important, but read-path correctness comes first.

## Canonical Docs

Read these for current work:

- [Overview](./nostr-client-core-design-v1/overview.md): current product/migration direction and scope.
- [Core Contract](./nostr-client-core-design-v1/core-contract.md): minimal v1 core interfaces, responsibilities, and non-responsibilities.
- [QueryClient / QueryRegistry Lifecycle](./nostr-client-core-design-v1/query-lifecycle-ja.md): `ensureXXX`, feed lifecycle, completion semantics, and safe batching rules.
- [Debug PoC Plan](./nostr-client-core-design-v1/debug-poc.md): debug-first validation route/column plan.
- [Migration Plan](./nostr-client-core-design-v1/migration-plan.md): destructive migration phases from docs cleanup to UI replacement.
- [SolidJS Integration](./nostr-client-core-design-v1/solid-integration.md): debug-first Solid adapters and later production UI replacement.
- [Local Development and Seed Scenarios](./nostr-client-core-design-v1/local-development.md): local relay, deterministic seeds, and e2e harness.

Reference docs. Useful, but not allowed to override the current direction above:

- [Runtime Architecture](./nostr-client-core-design-v1/runtime-architecture.md)
- [Event Store and Query Registry](./nostr-client-core-design-v1/data-model.md)
- [Event Feed Strategies and Query Planning](./nostr-client-core-design-v1/event-feed-strategies.md)
- [NIP Update Automation](./nostr-client-core-design-v1/nip-automation.md)

If a reference doc says to preserve v0 compatibility, prefer the current direction in this index instead.

## Initial Implementation Slices

1. Clean docs so agents stop following stale TanStack DB / v0 compatibility guidance.
2. Freeze the minimal read-path core contract.
3. Implement the core with fake transport tests.
4. Wire `rx-nostr` through `RxNostrTransport`.
5. Add `/debug/v1-core` and a plain debug feed column.
6. Validate against deterministic local relay seed scenarios.
7. Replace existing UI paths with v1 APIs and delete v0 internals.

## Done Means

The read-path PoC is not done when the old UI still builds. It is done when:

- local seed events can be fetched through `QueryClient`,
- raw events are stored in `EventStore`,
- feed membership/loading/cursor state lives in `FeedStateStore`,
- profile data is derived from kind:0 events,
- a debug column can render events without the old EventCache/query stack,
- active query/store state is inspectable,
- the path works repeatedly in local validation.
