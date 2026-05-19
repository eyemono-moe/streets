# v1 Migration Plan

[Back to v1 design index](../nostr-client-core-design-v1.md)

This is now a destructive, speed-first migration plan. Existing users do not need to be protected, so the project should stop paying compatibility costs that prevent the v1 core from becoming real.

## Principles

1. Core first, existing UI later.
2. Debug PoC first, production columns later.
3. v1 APIs do not preserve v0 hook return shapes.
4. Temporary compatibility code is allowed only inside a PR whose purpose is to delete or replace it.
5. TanStack DB-era docs and v0 compatibility plans are historical references, not current guidance.
6. Local deterministic validation is required before migrating production UI paths.

## Phases

### Phase 0: Docs Reset

Goal:

- Make the current direction obvious to agents and humans.
- Remove or demote stale guidance that recommends TanStack DB or v0 compatibility migration.

Work:

- Keep the root index short and authoritative.
- Add a minimal core contract doc.
- Add a debug PoC doc.
- Mark old long design notes as reference-only if they still contain useful details.
- Archive or rewrite docs that tell implementers to preserve old call sites.

Done when:

- A new agent can read the index and understand that destructive v1 migration is preferred.
- No current doc recommends shaping new core APIs around v0 UI interfaces.

### Phase 1: Minimal Core Contract Freeze

Goal:

- Decide the smallest read-path API needed for a working PoC.

Scope:

- `NostrTransport`
- `EventStore`
- `FeedStateStore`
- `ProfileView`
- `QueryClient`
- `QueryRegistry`
- debug snapshots

Out of scope:

- publish pipeline,
- IndexedDB persistence,
- SharedWorker/cross-tab ownership,
- production UI parity,
- reaction/repost/quote fanout.

Done when:

- fake transport tests can be written against the interfaces without referencing old UI hooks.

### Phase 2: Read Core PoC

Goal:

- Prove that the v1 read core can fetch, ingest, store, derive, and expose feed state.

Work:

- Implement memory `EventStore` if current implementation is not sufficient.
- Implement memory `FeedStateStore` if current implementation is not sufficient.
- Implement minimal `QueryClient` read APIs.
- Keep `QueryRegistry` thin: active work, cleanup, timeout, listener routing.
- Use fake transport tests first.

Done when:

- `ensureEvent` ingests a known event.
- `ensureProfile` ingests kind:0 and `ProfileView` returns metadata.
- `ensureEventFeed` / `fetchMoreEventFeed` updates feed item ids and loading/cursor state.
- missing requests time out and clean up.

### Phase 3: rx-nostr Wiring + Local Relay Seed

Goal:

- Replace fake transport with `RxNostrTransport` for local relay validation.

Work:

- Wire `rx-nostr` only through `NostrTransport`.
- Run deterministic local seed scenarios.
- Confirm local relay events reach `EventStore` and feed state.

Done when:

- local seeded notes can be fetched through the v1 read path,
- no UI compatibility layer is needed to verify the result.

### Phase 4: Debug UI PoC

Goal:

- Validate the core in the browser without production column complexity.

Work:

- Add `/debug/v1-core`.
- Add a plain `DebugFeedColumn`.
- Add `DebugProfilePanel`.
- Add active query/store snapshots.

Done when:

- seeded feed renders,
- fetch-more works,
- profile derivation is visible,
- active subscriptions can be inspected,
- repeated local runs are stable.

### Phase 5: Correctness Hardening

Goal:

- Fix the core before production UI migration hides problems.

Cases:

- duplicate event deliveries,
- replaceable kind:0 newer-wins,
- same event from multiple relays,
- backward request timeout,
- live subscription cleanup,
- EOSE vs feed completion,
- cursor updates,
- relay disconnect/reconnect basics.

Done when:

- each case has a focused test or deterministic debug scenario.

### Phase 6: Production UI Replacement

Goal:

- Make existing UI use v1 APIs directly.

Work:

- Change component props and hooks to match v1 data structures.
- Simplify UI temporarily where needed.
- Remove old EventCache/query/provider paths.
- Delete compatibility wrappers instead of extending them.

Order:

1. simple event rendering,
2. profile display,
3. simple user/feed columns,
4. home timeline wrapper,
5. optional relation/action/hover/quote features.

Done when:

- production UI and debug UI read the same v1 core state,
- old v0 cache/query paths are gone,
- no component emits relay requests directly.

## Suggested Linear Issues

1. Clean v1 architecture docs for destructive migration.
2. Define minimal v1 read core contract.
3. Implement read core PoC with fake transport tests.
4. Wire rx-nostr transport and local relay seed fetch.
5. Add v1 debug route and debug feed column.
6. Harden read correctness with deterministic local cases.
7. Replace production columns with v1 feed APIs.

## Validation Commands

Use the smallest command that proves the current phase.

Documentation-only:

```bash
pnpm run check
```

Core TypeScript changes:

```bash
pnpm vitest run <focused-test-file>
pnpm run build
```

Debug/local validation:

```bash
pnpm run dev
# plus the local relay/seed command documented in local-development.md
```
