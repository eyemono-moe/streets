import type { NostrEvent } from "nostr-tools";
import type { Component } from "solid-js";
import {
  For,
  Show,
  createMemo,
  createSignal,
  onCleanup,
  onMount,
} from "solid-js";
import type { EventFeedDefinition } from "../../core/query/event-feed";
import type { NostrCore } from "../../core/solid/provider";
import { useNostrCore } from "../../core/solid/provider";
import type { FeedSnapshot } from "../../core/store/feed-state-store";

type V1CoreDebugRouteSnapshot = {
  queryClient: ReturnType<NostrCore["queryClient"]["getSnapshot"]>;
  connectionState: ReturnType<NostrCore["connectionState"]["getSnapshot"]>;
  updatedAt: string;
};

const createDebugRouteSnapshot = (
  core: NostrCore,
): V1CoreDebugRouteSnapshot => ({
  queryClient: core.queryClient.getSnapshot(),
  connectionState: core.connectionState.getSnapshot(),
  updatedAt: new Date().toISOString(),
});

const snapshotReplacer = (_key: string, value: unknown) => {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
    };
  }
  return value;
};

const DebugSection: Component<{ title: string; value: unknown }> = (props) => (
  <section class="space-y-2 rounded-2 border border-alpha-300 bg-alpha-50 p-3">
    <h2 class="font-bold text-sm">{props.title}</h2>
    <pre class="max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-2 bg-alpha-100 p-2 text-xs leading-relaxed">
      {JSON.stringify(props.value, snapshotReplacer, 2)}
    </pre>
  </section>
);

type DebugFeedColumnProps = EventFeedDefinition;

const DEFAULT_DEBUG_FEED: DebugFeedColumnProps = {
  id: "debug-feed",
  filters: { kinds: [1], limit: 20 },
  strategy: "backfill",
  limit: 20,
};

const DEFAULT_DEBUG_PROFILE_PUBKEY =
  "34695541ee6485387a26fc35196106d9f5571e72a674e09f5ae0b1671aed801f";

const missingFeedSnapshot = (feedId: string): FeedSnapshot => ({
  feedId,
  items: [],
  eventIds: [],
  status: "idle",
  hasMoreBackfill: false,
  eoseRelays: [],
  activeRelays: [],
});

const formatTimestamp = (createdAt?: number) =>
  createdAt === undefined ? "-" : new Date(createdAt * 1_000).toISOString();

type DebugProfilePanelProps = {
  pubkey?: string;
  relays?: readonly string[];
};

type ParsedProfileMetadata = {
  name?: string;
  display_name?: string;
  picture?: string;
  about?: string;
};

const parseProfileMetadata = (event: NostrEvent): ParsedProfileMetadata => {
  try {
    const parsed = JSON.parse(event.content) as Record<string, unknown>;
    return {
      name: typeof parsed.name === "string" ? parsed.name : undefined,
      display_name:
        typeof parsed.display_name === "string"
          ? parsed.display_name
          : undefined,
      picture: typeof parsed.picture === "string" ? parsed.picture : undefined,
      about: typeof parsed.about === "string" ? parsed.about : undefined,
    };
  } catch {
    return {};
  }
};

const DebugFeedColumn: Component<DebugFeedColumnProps> = (props) => {
  const core = useNostrCore();
  const [feedSnapshot, setFeedSnapshot] = createSignal(
    core.feedStateStore.getSnapshot(props.id),
  );
  const [eventVersion, setEventVersion] = createSignal(0);
  const refreshFeed = () =>
    setFeedSnapshot(core.feedStateStore.getSnapshot(props.id));
  const refreshEvents = () => setEventVersion((version) => version + 1);

  onMount(() => {
    core.queryClient.ensureEventFeed({
      id: props.id,
      filters: props.filters,
      strategy: props.strategy,
      relays: props.relays,
      limit: props.limit,
    });
    refreshFeed();
  });

  const cleanupFeed = core.feedStateStore.subscribe(props.id, refreshFeed);
  const cleanupEvents = core.eventStore.subscribe(refreshEvents);

  onCleanup(() => {
    cleanupFeed();
    cleanupEvents();
    core.queryClient.stopEventFeed(props.id);
  });

  const events = createMemo(() => {
    eventVersion();
    const snapshot = feedSnapshot() ?? missingFeedSnapshot(props.id);
    return snapshot.eventIds
      .map((eventId) => core.eventStore.getEvent(eventId))
      .filter((event): event is NostrEvent => event !== undefined);
  });

  const fetchMore = () => {
    void core.queryClient.fetchMoreEventFeed(props.id);
  };
  const stopFeed = () => core.queryClient.stopEventFeed(props.id);

  return (
    <section class="space-y-3 rounded-2 border border-alpha-300 bg-alpha-50 p-3">
      <header class="space-y-1">
        <h2 class="font-bold text-sm">DebugFeedColumn</h2>
        <p class="text-alpha-700 text-xs">feed id: {props.id}</p>
        <p class="text-alpha-700 text-xs">
          status: {feedSnapshot().status} · events: {events().length} · has
          more: {String(feedSnapshot().hasMoreBackfill)}
        </p>
        <p class="text-alpha-700 text-xs">
          oldest: {formatTimestamp(feedSnapshot().oldestCreatedAt)} · newest:{" "}
          {formatTimestamp(feedSnapshot().newestCreatedAt)}
        </p>
        <p class="text-alpha-700 text-xs">
          relays: {feedSnapshot().activeRelays.join(", ") || "-"}
        </p>
      </header>

      <div class="flex gap-2">
        <button
          class="rounded-2 border border-alpha-400 px-2 py-1 text-xs"
          onClick={fetchMore}
          type="button"
        >
          Fetch more
        </button>
        <button
          class="rounded-2 border border-alpha-400 px-2 py-1 text-xs"
          onClick={stopFeed}
          type="button"
        >
          Stop feed
        </button>
      </div>

      <ol class="space-y-2">
        <For each={events()}>
          {(event) => (
            <li class="space-y-1 rounded-2 bg-alpha-100 p-2 text-xs">
              <div>event id: {event.id}</div>
              <div>pubkey: {event.pubkey}</div>
              <div>kind: {event.kind}</div>
              <div>created_at: {event.created_at}</div>
              <pre class="whitespace-pre-wrap break-words">{event.content}</pre>
            </li>
          )}
        </For>
      </ol>
    </section>
  );
};

const DebugProfilePanel: Component<DebugProfilePanelProps> = (props) => {
  const core = useNostrCore();
  const [version, setVersion] = createSignal(0);
  const refresh = () => setVersion((current) => current + 1);
  const cleanupProfiles = core.profileView.subscribe(refresh);

  if (props.pubkey) {
    void core.queryClient
      .ensureProfile({
        pubkey: props.pubkey,
        relays: props.relays,
      })
      .catch(() => {
        // DebugProfilePanel renders the store-backed profile view; failed fetches
        // should remain visible through query snapshots, not crash the route.
      });
  }

  onCleanup(cleanupProfiles);

  const profileEvent = createMemo(() => {
    version();
    if (props.pubkey) {
      return core.profileView.getProfile(props.pubkey);
    }
    return core.profileView.listProfiles()[0];
  });

  const metadata = createMemo(() => {
    const event = profileEvent();
    return event ? parseProfileMetadata(event) : undefined;
  });

  return (
    <section class="space-y-3 rounded-2 border border-alpha-300 bg-alpha-50 p-3">
      <header class="space-y-1">
        <h2 class="font-bold text-sm">DebugProfilePanel</h2>
        <p class="text-alpha-700 text-xs">
          pubkey: {profileEvent()?.pubkey ?? props.pubkey ?? "-"}
        </p>
        <p class="text-alpha-700 text-xs">
          source kind:0 event id: {profileEvent()?.id ?? "-"}
        </p>
      </header>

      <Show
        fallback={<p class="text-alpha-700 text-xs">profile loading: true</p>}
        when={profileEvent()}
      >
        {(event) => (
          <div class="space-y-1 text-xs">
            <div>profile loading: false</div>
            <div>name: {metadata()?.name ?? "-"}</div>
            <div>display_name: {metadata()?.display_name ?? "-"}</div>
            <div>picture: {metadata()?.picture ?? "-"}</div>
            <div>about: {metadata()?.about ?? "-"}</div>
            <DebugSection title="rawProfileEvent" value={event()} />
          </div>
        )}
      </Show>
    </section>
  );
};

const DebugV1CoreRoute: Component = () => {
  if (!import.meta.env.DEV) {
    return (
      <main class="h-full overflow-auto p-4 text-sm">
        <div class="mx-auto max-w-5xl space-y-2">
          <h1 class="font-bold text-xl">v1 Core Debug</h1>
          <p class="text-alpha-700 text-sm">
            This debug route is only available in development builds.
          </p>
        </div>
      </main>
    );
  }

  const core = useNostrCore();
  const [snapshot, setSnapshot] = createSignal(createDebugRouteSnapshot(core));
  const refreshSnapshot = () => setSnapshot(createDebugRouteSnapshot(core));

  const cleanupEventStore = core.eventStore.subscribe(refreshSnapshot);
  const cleanupFeedState = core.feedStateStore.subscribeAll(refreshSnapshot);
  const cleanupQueryRegistry = core.queryRegistry.subscribe(refreshSnapshot);
  const connectionStateSubscription = core.connectionState
    .observe()
    .subscribe({ next: refreshSnapshot });

  onCleanup(() => {
    cleanupEventStore();
    cleanupFeedState();
    cleanupQueryRegistry();
    connectionStateSubscription.unsubscribe();
  });

  return (
    <main class="h-full overflow-auto p-4 text-sm">
      <div class="mx-auto max-w-5xl space-y-4">
        <header class="space-y-1">
          <p class="text-alpha-600 text-xs">Debug route</p>
          <h1 class="font-bold text-xl">v1 Core Debug</h1>
          <p class="text-alpha-700 text-sm">
            Read-only snapshot from the v1 core. This route intentionally avoids
            legacy EventCache/query APIs and production Event rendering.
          </p>
        </header>

        <DebugFeedColumn {...DEFAULT_DEBUG_FEED} />
        <DebugProfilePanel pubkey={DEFAULT_DEBUG_PROFILE_PUBKEY} />

        <div class="grid gap-4 lg:grid-cols-2">
          <DebugSection title="queryClient" value={snapshot().queryClient} />
          <DebugSection
            title="connectionState"
            value={snapshot().connectionState}
          />
          <DebugSection
            title="feedStateStore"
            value={snapshot().queryClient.feedStateStore}
          />
          <DebugSection
            title="registeredFeeds"
            value={snapshot().queryClient.feeds}
          />
          <DebugSection
            title="queryRegistry"
            value={snapshot().queryClient.queryRegistry}
          />
          <DebugSection
            title="eventStore"
            value={snapshot().queryClient.eventStore ?? null}
          />
        </div>

        <DebugSection title="rawSnapshot" value={snapshot()} />
      </div>
    </main>
  );
};

export default DebugV1CoreRoute;
