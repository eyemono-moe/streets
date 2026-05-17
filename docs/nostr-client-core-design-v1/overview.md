# Nostr Client Core v1 Overview

[Back to v1 design index](../nostr-client-core-design-v1.md)

Start here for the high-level direction, constraints, and milestone scope. Load the narrower topic files for implementation details.

## In this file

- [Purpose](#purpose)
- [High-Level Requirements](#high-level-requirements)
- [Additional Workstreams Not Covered by the Core Diagram](#additional-workstreams-not-covered-by-the-core-diagram)
- [Key Design Decisions](#key-design-decisions)
- [Non-Goals](#non-goals)
- [Initial Minimal Milestone](#initial-minimal-milestone)
- [Final Target Shape](#final-target-shape)

---

## Purpose

This document describes the proposed architecture for replacing the core relay/event/query system of the existing Nostr client application while preserving the existing repository history and prior contributor work.

The application is a browser-based Nostr client, primarily targeting desktop usage with a TweetDeck-like multi-column UI, while remaining usable on mobile. It is built with SolidJS and already uses `rx-nostr`. The goal is to redesign the core system around `rx-nostr`, a Nostr-filter-first EventStore, QueryRegistry, FeedStateStore, derived views, and SolidJS adapters.

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
- Use a project-owned Nostr-filter-first EventStore and FeedStateStore instead of TanStack DB as the target architecture.
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

### Decision 3: EventStore Is the Raw Event Source of Truth

The EventStore owns raw events, Nostr-filter-first indexes, seen relay tracking, replaceable-event resolution, and persistence interfaces. It should query Nostr filters directly instead of translating them through a generic database query model.

### Decision 4: QueryRegistry and FeedStateStore Are Separate

QueryRegistry owns relay-facing feed intent, filter deduplication/batching, subscription reference counting, and fetch lifecycle. FeedStateStore owns UI-facing feed snapshots: event membership, loading, EOSE, cursors, errors, and optimistic local items.

### Decision 5: Kind-Specific Data Is Derived from Events

Profiles, contact lists, relay lists, reactions, reposts, and future NIP-specific concepts should be derived views over raw events. Core storage stays event-centered so new kinds can be added by adding views/indexers rather than changing the source of truth.

### Decision 6: Solid Store Is Only for UI State

Do not put the full event graph or indexes into Solid's `createStore`.

### Decision 7: Preserve Existing Repository History

Do not create a new repository. Prefer aggressive removal of migrated v0 paths, but keep PRs feature-sized and avoid unrelated rewrites.

### Decision 8: Seed Local Edge Cases

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
- MemoryEventStore
- MemoryFeedStateStore
- QueryRegistry skeleton
- ProfileView derived from kind:0 events
- useEventByID
- useProfile
- useEventFeed
- Existing UI migrates behind v1 hooks without keeping long-term compatibility layers
```

### Success Criteria

```txt
- Existing app still builds.
- Existing imports do not need large-scale rewrites.
- A received event is written to EventStore.
- FeedStateStore records which feed(s) the event belongs to.
- Solid UI updates through getSnapshot + subscribe adapters.
- Profile metadata is derived from the newest kind:0 event.
- Duplicate relay events do not duplicate UI rows.
```

---

## Final Target Shape

```txt
SolidJS UI
  ↓
Feature hooks
  - useEventFeed
  - useHomeTimeline
  - useProfile
  - useEventByID
  - useNotifications
  ↓
Solid adapters
  - getSnapshot + subscribe
  - optional ObservableLike/from interop
  ↓
FeedStateStore + Derived Views
  ↓
EventStore
  ↓
QueryRegistry / PublishPipeline
  ↓
RxNostrTransport
  ↓
rx-nostr
  ↓
Nostr relays
```

The implementation should preserve repository history while moving behavior behind the new core. Old API surfaces should be removed as soon as their feature paths migrate; long-term mixed v0/v1 compatibility is not a goal.

## Related Files

- [Runtime Architecture](./runtime-architecture.md)
- [Event Store and Query Registry](./data-model.md)
- [Event Feed Strategies](./event-feed-strategies.md)
- [Migration Plan](./migration-plan.md)
