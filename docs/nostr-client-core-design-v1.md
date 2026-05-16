# Nostr Client Core v1 Design Proposal

> Status: v1 planning document. This is the implementation reference for the `streets v1` Linear project.
>
> Start with the event/profile migration path. Do not begin with a full timeline rewrite.

This file is now the entrypoint for the split v1 core design docs.

The old single-file design document was too large for efficient LLM context use. Load only the topic file that matches the task, then follow cross-links as needed.

## Reading Guide

- Start with [Overview](./nostr-client-core-design-v1/overview.md) for goals, requirements, decisions, non-goals, and the initial milestone.
- Use [Runtime Architecture](./nostr-client-core-design-v1/runtime-architecture.md) for transport, EventStore, QueryRegistry, FeedStateStore, derived views, and cross-tab boundaries.
- Use [Event Store and Query Registry](./nostr-client-core-design-v1/data-model.md) for the Nostr-filter-first store, feed state, and derived read-model shape.
- Use [SolidJS Integration](./nostr-client-core-design-v1/solid-integration.md) for UI state rules, hooks, and component migration boundaries.
- Use [Event Feed Strategies and Query Planning](./nostr-client-core-design-v1/event-feed-strategies.md) for generalized infinite/event-list fetching, query planning, relay policy, and related-event fetch policy.
- Use [Local Development and Seed Scenarios](./nostr-client-core-design-v1/local-development.md) for local relay, asset server, deterministic seeds, and harness work.
- Use [Migration Plan and Testing Strategy](./nostr-client-core-design-v1/migration-plan.md) for PR order, migration sequence, and validation strategy.
- Use [NIP Update Automation](./nostr-client-core-design-v1/nip-automation.md) for the NIP monitoring/LLM impact-report workstream.

## Core Shape

```txt
rx-nostr
  ↓
RxNostrTransport
  ↓
QueryRegistry
  ↓
EventStore / FeedStateStore / Derived Views
  ↓
SolidJS UI
```

## Current Core Decisions

1. Keep `rx-nostr`; do not reimplement relay subscription management.
2. Hide `rx-nostr` behind a `NostrTransport` interface.
3. EventStore is the raw Nostr event source of truth and speaks Nostr filter semantics directly.
4. QueryRegistry owns feed intent, relay subscription reuse, filter batching/deduplication, and fetch lifecycle.
5. FeedStateStore owns per-feed UI state such as item membership, loading, EOSE, cursors, and errors.
6. Derived views such as ProfileView are built from events; kind-specific data is not a separate core source of truth.
7. Solid stores are for UI state only; data stores expose getSnapshot + subscribe adapters.
8. v1 is a one-shot product migration, not a long-term mixed v0/v1 runtime.
9. Infinite/event-list columns use generic event feed/fetch strategies; home timeline is only one feature-level wrapper.
10. Publishing should use a project-owned PublishPipeline with optimistic local event overlays and per-relay publish state.

## Suggested Context Loading

For LLM implementation tasks, prefer this minimal loading pattern:

```txt
Architecture boundary work:
  overview.md + runtime-architecture.md

EventStore / FeedStateStore work:
  overview.md + data-model.md + runtime-architecture.md

UI hook/component migration:
  overview.md + solid-integration.md + data-model.md

Infinite/event-list/query planning work:
  overview.md + event-feed-strategies.md + data-model.md

Local relay/e2e harness work:
  overview.md + local-development.md + migration-plan.md

NIP automation work:
  overview.md + nip-automation.md
```

## File Map

```txt
docs/nostr-client-core-design-v1.md
  └─ this index

docs/nostr-client-core-design-v1/
  ├─ overview.md
  ├─ runtime-architecture.md
  ├─ data-model.md
  ├─ solid-integration.md
  ├─ event-feed-strategies.md
  ├─ local-development.md
  ├─ migration-plan.md
  └─ nip-automation.md
```
