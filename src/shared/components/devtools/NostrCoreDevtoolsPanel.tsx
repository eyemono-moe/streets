import { For, type JSX, Show, createSignal, onCleanup } from "solid-js";
import {
  type NostrCoreDevtoolsSnapshot,
  nostrCoreDevtoolsClient,
} from "./nostr-core-devtools-client";

const dateTime = (value: number | undefined) =>
  value === undefined ? "-" : new Date(value * 1000).toLocaleString();

const clockTime = (value: number | undefined) =>
  value === undefined ? "-" : new Date(value).toLocaleTimeString();

const Section = (props: { title: string; children: JSX.Element }) => (
  <section class="rounded border border-base-300 bg-base-100 p-3">
    <h3 class="mb-2 font-bold text-sm">{props.title}</h3>
    {props.children}
  </section>
);

const Stat = (props: { label: string; value: string | number }) => (
  <div class="rounded bg-base-200 p-2">
    <div class="text-xs opacity-70">{props.label}</div>
    <div class="font-mono text-lg">{props.value}</div>
  </div>
);

const NostrCoreDevtoolsPanel = () => {
  const [snapshot, setSnapshot] = createSignal<NostrCoreDevtoolsSnapshot>();

  const cleanupSnapshot = nostrCoreDevtoolsClient.on(
    "snapshot-changed",
    (event) => setSnapshot(event.payload),
  );

  nostrCoreDevtoolsClient.emit("request-snapshot", undefined);

  onCleanup(() => {
    cleanupSnapshot();
  });

  return (
    <div class="max-h-[--tsd-main-panel-height] overflow-y-auto overflow-x-hidden p-4 text-sm">
      <Show
        when={snapshot()}
        fallback={
          <div class="opacity-70">Waiting for Nostr core events...</div>
        }
      >
        {(data) => (
          <div class="grid gap-3">
            <div class="flex items-center justify-between gap-3">
              <h2 class="font-bold text-lg">streets Nostr Core</h2>
              <div class="font-mono text-xs opacity-70">
                updated {clockTime(data().updatedAt)}
              </div>
              <button
                type="button"
                class="appearance-none rounded px-2 py-1 text-xs"
                onClick={() =>
                  navigator.clipboard.writeText(JSON.stringify(data(), null, 2))
                }
              >
                copy current core summary
              </button>
            </div>

            <Section title="Summary">
              <div class="grid grid-cols-2 gap-2 md:grid-cols-4">
                <Stat label="events" value={data().eventStore.eventCount} />
                <Stat label="feeds" value={data().feeds.length} />
                <Stat
                  label="queries"
                  value={data().queryRegistry.activeSubscriptionCount}
                />
                <Stat
                  label="relays"
                  value={Object.keys(data().connectionState).length}
                />
              </div>
            </Section>

            <Section title="Relay Connection State">
              <div class="grid gap-1">
                <For each={Object.entries(data().connectionState)}>
                  {([relay, state]) => (
                    <div class="grid grid-cols-[1fr_auto] gap-2 rounded bg-base-200 p-2">
                      <div class="truncate font-mono text-xs">{relay}</div>
                      <div class="font-mono text-xs">{state ?? "unknown"}</div>
                    </div>
                  )}
                </For>
              </div>
            </Section>

            <Section title="EventStore">
              <div class="grid gap-3 md:grid-cols-3">
                <div>
                  <div class="mb-1 text-xs opacity-70">Kind counts</div>
                  <div class="grid gap-1">
                    <For each={data().eventStore.kindCounts}>
                      {(item) => (
                        <div class="flex justify-between rounded bg-base-200 p-2 font-mono text-xs">
                          <span>kind {item.kind}</span>
                          <span>{item.count}</span>
                        </div>
                      )}
                    </For>
                  </div>
                </div>
                <div>
                  <div class="mb-1 text-xs opacity-70">Relay counts</div>
                  <div class="grid gap-1">
                    <For each={data().eventStore.relayCounts}>
                      {(item) => (
                        <div class="grid grid-cols-[1fr_auto] gap-2 rounded bg-base-200 p-2 font-mono text-xs">
                          <span class="truncate">{item.relay}</span>
                          <span>{item.count}</span>
                        </div>
                      )}
                    </For>
                  </div>
                </div>
                <div>
                  <div class="mb-1 text-xs opacity-70">Latest created_at</div>
                  <div class="rounded bg-base-200 p-2 font-mono text-xs">
                    {dateTime(data().eventStore.latestCreatedAt)}
                  </div>
                </div>
              </div>
            </Section>

            <Section title="FeedStateStore">
              <button
                type="button"
                class="mb-2 appearance-none rounded px-2 py-1 text-xs"
                onClick={() =>
                  navigator.clipboard.writeText(
                    JSON.stringify(data().feeds, null, 2),
                  )
                }
              >
                copy current feeds as JSON
              </button>
              <div class="grid gap-2">
                <For each={data().feeds}>
                  {(feed) => (
                    <div class="rounded bg-base-200 p-2">
                      <div class="mb-1 flex justify-between gap-2">
                        <span class="font-mono text-xs">{feed.feedId}</span>
                        <span class="font-mono text-xs">{feed.status}</span>
                      </div>
                      <div class="grid grid-cols-2 gap-2 text-xs md:grid-cols-4">
                        <span>items: {feed.eventIds.length}</span>
                        <span>hasMore: {String(feed.hasMoreBackfill)}</span>
                        <span>oldest: {dateTime(feed.oldestCreatedAt)}</span>
                        <span>newest: {dateTime(feed.newestCreatedAt)}</span>
                      </div>
                      <Show when={feed.error}>
                        {(error) => (
                          <div class="mt-1 text-error text-xs">{error()}</div>
                        )}
                      </Show>
                    </div>
                  )}
                </For>
              </div>
            </Section>

            <Section title="QueryRegistry">
              <button
                type="button"
                class="mb-2 appearance-none rounded px-2 py-1 text-xs"
                onClick={() =>
                  navigator.clipboard.writeText(
                    JSON.stringify(data().queryRegistry, null, 2),
                  )
                }
              >
                copy current queries as JSON
              </button>
              <div class="grid gap-2">
                <For each={data().queryRegistry.subscriptions}>
                  {(subscription) => (
                    <details class="rounded p-2">
                      <summary class="cursor-pointer font-mono text-xs">
                        {subscription.mode} · listeners{" "}
                        {subscription.listenerCount}
                      </summary>
                      <pre class="mt-2 overflow-auto text-wrap break-all rounded p-2 text-xs">
                        {JSON.stringify(subscription, null, 2)}
                      </pre>
                    </details>
                  )}
                </For>
              </div>
            </Section>
          </div>
        )}
      </Show>
    </div>
  );
};

export default NostrCoreDevtoolsPanel;
