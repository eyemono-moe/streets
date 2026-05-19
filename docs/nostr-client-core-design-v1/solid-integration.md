# SolidJS Integration

[Back to v1 design index](../nostr-client-core-design-v1.md)

Solid integration for the current v1 direction: debug UI first, production UI replacement later. This document does not preserve old v0 hook return shapes.

## Main Rule

Do not store the raw event graph in Solid's `createStore`.

Solid state should hold UI-only state:

```txt
- column layout
- selected column
- dialog state
- compose draft state
- drag state
- local UI preferences
- view-local ephemeral controls
```

Core data should live in project-owned stores exposed through `getSnapshot + subscribe`.

## Core Store Adapter

Core stores should not depend on Solid primitives:

```ts
interface ReadableStore<T> {
  getSnapshot(): T
  subscribe(listener: () => void): () => void
}
```

Solid adapters can bridge this into signals:

```ts
function useStoreSnapshot<T>(store: Accessor<ReadableStore<T>>) {
  const [value, setValue] = createSignal(store().getSnapshot())

  // Keep the Solid signal attached to the current core store snapshot.
  createEffect(() => {
    const current = store()
    setValue(() => current.getSnapshot())
    const unsubscribe = current.subscribe(() => {
      setValue(() => current.getSnapshot())
    })
    onCleanup(unsubscribe)
  })

  return value
}
```

Rx/Observable interop is allowed near `rx-nostr`, but the core store contract should stay simple.

## Debug UI First

The first browser integration target is `/debug/v1-core`, not the existing production column UI.

Debug components should consume v1 stores directly:

```txt
DebugFeedColumn
  ↓ QueryClient.ensureEventFeed / fetchMoreEventFeed
FeedStateStore event ids
  ↓ join with
EventStore raw events
  ↓ optional
ProfileView profile snapshot
```

Do not use the old Event component stack for the first proof. Plain rows are enough.

## Production UI Replacement Later

After the debug PoC works, update production UI to match v1 data structures.

Preferred direction:

- Change component props when old props encode v0 cache/query assumptions.
- Simplify components temporarily rather than adding compatibility wrappers.
- Reintroduce relation/action/hover/quote features only after the simple feed path is stable.
- Delete old EventCache/query/provider paths as soon as production paths no longer need them.

## Filter Issuance Policy

Relay filters should be issued only by the v1 query layer:

```txt
UI / feature params
  ↓
QueryClient.ensure* API
  ↓
QueryRegistry
  ↓
NostrTransport
```

Do not emit relay filters directly from:

- column components,
- event renderers,
- derived views,
- store adapters.

Derived views may read relationships from `EventStore`; they must not fetch.

## v1 Feed Hook Sketch

```tsx
function useV1Feed(feedDefinition: Accessor<EventFeedDefinition>) {
  const core = useV1Core()

  // Keep the feed active for the current definition. Rendering reads snapshots.
  createEffect(() => {
    const handle = core.queryClient.ensureEventFeed(feedDefinition())
    onCleanup(() => handle.close())
  })

  return useStoreSnapshot(() =>
    core.feedStateStore.getReadable(feedDefinition().id),
  )
}
```

## v1 Event Row Sketch

```tsx
function V1NoteRow(props: { eventId: string }) {
  const core = useV1Core()
  const event = useEventStoreRow(() => core.eventStore, () => props.eventId)
  const profile = useProfileSnapshot(() => core.profileView, () => event()?.pubkey)

  return <NoteView event={event()} profile={profile()} />
}
```

This is the target shape. If existing components do not fit it, change the components.

## Related Files

- [Core Contract](./core-contract.md)
- [Debug PoC Plan](./debug-poc.md)
- [Migration Plan](./migration-plan.md)
