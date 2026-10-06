import {
  type RelayLimitation,
  fetchRelayInfo,
} from "@streets/core/relay/relay-info";
import type {
  RelayTraffic,
  RelayTrafficStats,
  TrafficCount,
} from "@streets/core/relay/relay-traffic";
import {
  type Component,
  For,
  Show,
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
} from "solid-js";
import { createStore, reconcile } from "solid-js/store";

const kb = (bytes: number) => `${(bytes / 1024).toFixed(1)} KB`;
const duration = (ms: number) => {
  const seconds = Math.round(ms / 1000);
  return seconds < 60
    ? `${seconds}s`
    : `${Math.floor(seconds / 60)}m${String(seconds % 60).padStart(2, "0")}s`;
};
const total = (counts: Record<string, TrafficCount>): TrafficCount =>
  Object.values(counts).reduce(
    (sum, count) => ({
      count: sum.count + count.count,
      bytes: sum.bytes + count.bytes,
    }),
    { count: 0, bytes: 0 },
  );
const percent = (part: number, whole: number) =>
  whole === 0 ? "-" : `${((part / whole) * 100).toFixed(0)}%`;

const SORTS = {
  received: (stats: RelayTrafficStats) => total(stats.received).bytes,
  sent: (stats: RelayTrafficStats) => total(stats.sent).bytes,
  connected: (stats: RelayTrafficStats) => stats.connectedMs,
  duplicates: (stats: RelayTrafficStats) => stats.duplicates.bytes,
  subscriptions: (stats: RelayTrafficStats) => stats.peakSubscriptions,
} satisfies Record<string, (stats: RelayTrafficStats) => number>;

const COLUMNS = "grid grid-cols-[20rem_repeat(7,max-content)] gap-x-4";

const Counts: Component<{
  title: string;
  counts: Record<string, TrafficCount>;
}> = (props) => (
  <div class="flex flex-col gap-1">
    <h3 class="opacity-70">{props.title}</h3>
    <dl class="grid grid-cols-[max-content_max-content_max-content] gap-x-4">
      <For
        each={Object.entries(props.counts).sort(
          ([, a], [, b]) => b.bytes - a.bytes,
        )}
      >
        {([key, count]) => (
          <>
            <dt>{key}</dt>
            <dd class="text-right">{count.count}</dd>
            <dd class="text-right">{kb(count.bytes)}</dd>
          </>
        )}
      </For>
    </dl>
  </div>
);

/** リレーごとのやりとり。いつ見ても同じ物差しで比べられるよう、数え直しの口を持つ。 */
const RelayTrafficPanel: Component<{ traffic: RelayTraffic }> = (props) => {
  // 毎秒の読み直しで行を作り直すと、開いた内訳が閉じるので URL で突き合わせる。
  const [state, setState] = createStore({
    relays: props.traffic.snapshot(),
  });
  const relays = () => state.relays;
  const [elapsed, setElapsed] = createSignal(props.traffic.elapsedMs());
  const read = () => {
    setState("relays", reconcile(props.traffic.snapshot(), { key: "url" }));
    setElapsed(props.traffic.elapsedMs());
  };
  const timer = setInterval(read, 1_000);
  onCleanup(() => clearInterval(timer));

  const [sort, setSort] = createSignal<keyof typeof SORTS>("received");
  const sorted = createMemo(() => {
    const key = SORTS[sort()];
    return [...relays()].sort((a, b) => key(b) - key(a));
  });

  // 上限と比べるために NIP-11 を 1 度だけ引く。答えないリレーは null で覚える。
  const [limits, setLimits] = createStore<
    Record<string, RelayLimitation | null>
  >({});
  createEffect(() => {
    for (const { url } of relays()) {
      if (url in limits) continue;
      setLimits(url, null);
      void fetchRelayInfo(url).then((info) =>
        setLimits(url, info?.limitation ?? null),
      );
    }
  });
  const limitOf = (url: string) => limits[url] ?? undefined;

  const sum = createMemo(() =>
    relays().reduce(
      (acc, stats) => ({
        sent: acc.sent + total(stats.sent).bytes,
        received: acc.received + total(stats.received).bytes,
        events: acc.events + (stats.received.EVENT?.count ?? 0),
        duplicates: acc.duplicates + stats.duplicates.count,
        duplicateBytes: acc.duplicateBytes + stats.duplicates.bytes,
        open: acc.open + (stats.open ? 1 : 0),
        subscriptions: acc.subscriptions + stats.subscriptions,
      }),
      {
        sent: 0,
        received: 0,
        events: 0,
        duplicates: 0,
        duplicateBytes: 0,
        open: 0,
        subscriptions: 0,
      },
    ),
  );

  const copy = () =>
    void navigator.clipboard.writeText(
      JSON.stringify(
        {
          elapsedMs: Math.round(elapsed()),
          relays: relays().map((stats) => ({
            ...stats,
            connectedMs: Math.round(stats.connectedMs),
            limitation: limits[stats.url] ?? undefined,
          })),
        },
        null,
        2,
      ),
    );

  return (
    <div class="flex max-h-[var(--tsd-main-panel-height)] flex-col gap-4 overflow-auto p-4 font-mono text-sm">
      <div class="flex flex-wrap items-center gap-x-6 gap-y-2">
        <span>elapsed {duration(elapsed())}</span>
        <span>
          open {sum().open} / {relays().length} relays
        </span>
        <span>subs {sum().subscriptions}</span>
        <span>sent {kb(sum().sent)}</span>
        <span>received {kb(sum().received)}</span>
        <span>events {sum().events}</span>
        <span>
          duplicates {sum().duplicates} ({kb(sum().duplicateBytes)},{" "}
          {percent(sum().duplicateBytes, sum().received)})
        </span>
        <label class="flex items-center gap-2">
          sort
          <select
            class="border border-current rounded-1 bg-transparent"
            value={sort()}
            onChange={(event) =>
              setSort(event.currentTarget.value as keyof typeof SORTS)
            }
          >
            <For each={Object.keys(SORTS)}>
              {(key) => <option value={key}>{key}</option>}
            </For>
          </select>
        </label>
        <button
          type="button"
          class="border border-current rounded-1 px-2"
          onClick={() => {
            props.traffic.reset();
            read();
          }}
        >
          reset
        </button>
        <button
          type="button"
          class="border border-current rounded-1 px-2"
          onClick={copy}
        >
          copy JSON
        </button>
      </div>

      <div class="flex min-w-max flex-col">
        <div class={`${COLUMNS} border-b border-current pb-1 pl-4 opacity-70`}>
          <span>relay</span>
          <span>connected</span>
          <span>conn/try</span>
          <span>sent</span>
          <span>received</span>
          <span>dup</span>
          <span title="open now / peak / NIP-11 max_subscriptions">subs</span>
          <span>closed</span>
        </div>
        <For each={sorted()} fallback={<p class="opacity-70">-</p>}>
          {(stats) => {
            const received = () => total(stats.received);
            const max = () => limitOf(stats.url)?.maxSubscriptions;
            return (
              <details class="border-b border-current/20">
                <summary class={`${COLUMNS} cursor-pointer py-1`}>
                  <span
                    class="truncate"
                    classList={{ "opacity-50": !stats.open }}
                  >
                    {stats.url}
                  </span>
                  <span class="text-right">{duration(stats.connectedMs)}</span>
                  <span class="text-right">
                    {stats.connects}/{stats.attempts}
                  </span>
                  <span class="text-right">{kb(total(stats.sent).bytes)}</span>
                  <span class="text-right">{kb(received().bytes)}</span>
                  <span class="text-right">
                    {percent(stats.duplicates.bytes, received().bytes)}
                  </span>
                  <span
                    class="text-right"
                    classList={{
                      "c-danger":
                        max() !== undefined && stats.peakSubscriptions > max()!,
                    }}
                  >
                    {stats.subscriptions}/{stats.peakSubscriptions}/
                    {max() ?? "-"}
                  </span>
                  <span class="text-right">
                    {Object.values(stats.closedReasons).reduce(
                      (sum, count) => sum + count,
                      0,
                    )}
                  </span>
                </summary>
                <div class="flex flex-wrap gap-8 py-2 pl-4">
                  <Counts title="sent" counts={stats.sent} />
                  <Counts title="received" counts={stats.received} />
                  <Counts title="kinds" counts={stats.kinds} />
                  <Show when={Object.keys(stats.closedReasons).length > 0}>
                    <div class="flex flex-col gap-1">
                      <h3 class="opacity-70">closed reasons</h3>
                      <For each={Object.entries(stats.closedReasons)}>
                        {([reason, count]) => (
                          <span>
                            {count} × {reason}
                          </span>
                        )}
                      </For>
                    </div>
                  </Show>
                  <Show when={stats.notices.length > 0}>
                    <div class="flex flex-col gap-1">
                      <h3 class="opacity-70">notices</h3>
                      <For each={stats.notices}>
                        {(notice) => <span>{notice}</span>}
                      </For>
                    </div>
                  </Show>
                  <Show when={limitOf(stats.url)}>
                    {(limitation) => (
                      <div class="flex flex-col gap-1">
                        <h3 class="opacity-70">NIP-11 limitation</h3>
                        <span>
                          max_subscriptions{" "}
                          {limitation().maxSubscriptions ?? "-"}
                        </span>
                        <span>max_limit {limitation().maxLimit ?? "-"}</span>
                        <span>
                          max_message_length{" "}
                          {limitation().maxMessageLength ?? "-"}
                        </span>
                      </div>
                    )}
                  </Show>
                </div>
              </details>
            );
          }}
        </For>
      </div>
    </div>
  );
};

export default RelayTrafficPanel;
