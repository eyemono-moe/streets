# SolidJS Integration

[Back to v1 design index](../nostr-client-core-design-v1.md)

Solid integration rules, UI migration boundaries, and hook/component sketches.

## In this file

- [SolidJS Integration](#solidjs-integration)

---

## SolidJS Integration

### Main Rule

Do not store the entire raw event graph in Solid's `createStore`.

Solid state should hold UI-only state.

Use project-owned read stores exposed through `getSnapshot + subscribe` for event, profile, and event-feed data. Optional ObservableLike/Rx interop is allowed at the adapter boundary.

### Solid Store Should Hold

```txt
- Column layout
- Selected column
- Dialog open/close state
- Compose draft state
- Drag state
- Local UI preferences
- View-local ephemeral state
```

### Solid Store Should Not Hold

```txt
- Full raw event map
- Full tag indexes
- Full author indexes
- Replaceable event index
- Relay seen info
- Large profile maps
- IndexedDB cache internals
```


### Store Adapter Rule

Core stores should expose snapshot subscriptions rather than Solid primitives directly:

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

Rx/Observable interop is allowed where it is useful, especially near `rx-nostr`. Solid's `from` can consume an observable-like source, but core store APIs should not require RxJS for simple snapshot reads and tests.

### Column and Event Renderer Migration Boundaries

The current UI has two important legacy entry points:

```txt
src/features/Column/components/ColumnContent.tsx
src/shared/components/Event.tsx
src/shared/components/EventByID.tsx
src/shared/components/InfiniteEvents.tsx
src/shared/libs/query.ts
```

For v1, keep `ColumnContent` and the individual column components as UI composition and layout owners. A column should describe what event feed or one-shot query it needs, but it should not directly create `rx-nostr` requests, parse relay packets, or write cache data. Column-local Solid state should remain limited to layout, temporary column state, dialogs, and view-local controls.

Event renderers should become read-model consumers. `EventByID` should resolve an event row through the v1 Solid hook, then pass a parsed/renderable view model into `Event`. `Event` may continue to dispatch by event kind, but it should not fetch related events or mutate the repository. Rendering unknown events from the raw event row is acceptable as a fallback.

The migration path should preserve compatibility exports so existing call sites can move gradually:

```txt
legacy column component
  ↓ describes event feed/query params
v1 hook ensures query through QueryRegistry
  ↓ reads FeedStateStore / EventStore / derived view snapshots
EventByID / InfiniteEvents render read-model rows
```

### Filter Issuance Policy

Relay filters should be issued only by the v1 query layer:

```txt
UI / column params
  ↓
QueryClient.ensure* API
  ↓
QueryPlanner creates filters, relay choices, chunking, and priorities
  ↓
QueryRegistry reuses or reference-counts active work
  ↓
RxNostrTransport emits filters
```

Do not emit filters directly from column components, event renderers, derived views, or store adapters. This prevents duplicate subscriptions across columns and keeps relay traffic policy testable.

`cacheAndEmitRelatedEvent`-style behavior should be replaced by explicit related-event policy. Related event fetches may still be triggered, but only through `QueryClient`/`RelatedEventPolicy`, with clear reasons such as reply context, quoted event preview, repost source, or profile metadata. Derived views should record/read relationships from EventStore; they should not perform network fetches.

### Event Feed Hook Sketch

```tsx
function useEventFeed(params: Accessor<EventFeedParams>) {
  const client = useNostrClient()

  // This effect ensures the feed's fetch/subscription strategy is active for
  // the current feed definition. UI reads remain local store snapshots.
  createEffect(() => {
    client.queryRegistry.ensureEventFeed(params())
  })

  return useStoreSnapshot(() =>
    client.feedStateStore.getReadable(eventFeedId(params())),
  )
}
```

### Event Feed Component Sketch

```tsx
function EventFeedColumn(props: { feedId: string }) {
  const feed = useFeedSnapshot(() => props.feedId)

  return (
    <For each={feed().eventIds}>
      {(eventId) => <NoteRow eventId={eventId} />}
    </For>
  )
}
```

Feature-level hooks can wrap `useEventFeed`. For example, a home timeline hook can build a feed definition that uses the `liveBackfill` strategy with filters for the current followee set. A user reactions column can use the same strategy with `{ kinds: [7], authors: [pubkey] }`. The core feed layer should not need to know which feature is using it.

### Note Row Sketch

```tsx
function NoteRow(props: { eventId: string }) {
  const event = useEvent(() => props.eventId)
  const profile = useProfile(() => event()?.pubkey)

  return <NoteView event={event()} profile={profile()} />
}
```

---

## Related Files

- [Event Store and Query Registry](./data-model.md)
- [Event Feed Strategies](./event-feed-strategies.md)
- [Migration Plan](./migration-plan.md)
