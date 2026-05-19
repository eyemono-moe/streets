import type { Component } from "solid-js";
import { createSignal, onCleanup } from "solid-js";
import type { NostrCore } from "../../core/solid/provider";
import { useNostrCore } from "../../core/solid/provider";

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
