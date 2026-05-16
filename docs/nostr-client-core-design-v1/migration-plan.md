# Migration Plan and Testing Strategy

[Back to v1 design index](../nostr-client-core-design-v1.md)

Incremental migration order, PR breakdown, and verification strategy for the v1 core cutover.

## In this file

- [Migration Strategy for Existing Repository](#migration-strategy-for-existing-repository)
- [Suggested PR Plan](#suggested-pr-plan)
- [Implementation Order Inside the New Core](#implementation-order-inside-the-new-core)
- [Testing Strategy](#testing-strategy)

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

### PR 9: Migrate Event Feed / Infinite Columns

Migrate timeline-like infinite queries to the generic event feed model:

```txt
QueryClient.ensureEventFeed()
  ↓
rx-nostr transport fetch/live subscription
  ↓
repository
  ↓
TanStack DB eventFeedItems
  ↓
Solid live query
```

The home timeline should become one feature wrapper around the event feed primitive, not the generic core abstraction.

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
11. Implement `liveBackfill` event feed backfill.
12. Implement `liveBackfill` event feed live subscription.
13. Add local relay seed scenarios.
14. Add IndexedDB repository.
15. Add cross-tab improvements.
```

Do not start with a home timeline feature. Start with `useEventByID` and `useProfile`, then move to the generic event feed primitive and wrap it for home timeline later.

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

## Related Files

- [Overview](./overview.md)
- [Runtime Architecture](./runtime-architecture.md)
- [Local Development](./local-development.md)
