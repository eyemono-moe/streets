import type { ReadLayer } from "@streets/core/read/read-layer";
import {
  type Component,
  For,
  type JSX,
  Show,
  createSignal,
  onCleanup,
} from "solid-js";
import { diagnostics } from "./diagnostics";

const Rows: Component<{ rows: [string, JSX.Element][] }> = (props) => (
  <dl class="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1">
    <For each={props.rows}>
      {([key, value]) => (
        <>
          <dt class="opacity-70">{key}</dt>
          <dd class="break-all">{value}</dd>
        </>
      )}
    </For>
  </dl>
);

const Section: Component<{ title: string; children: JSX.Element }> = (
  props,
) => (
  <section class="flex flex-col gap-2">
    <h2 class="font-bold">{props.title}</h2>
    {props.children}
  </section>
);

const ms = (value: number) => `${value.toFixed(0)} ms`;

const ReadLayerPanel: Component<{ readLayer: ReadLayer }> = (props) => {
  // 接続数とストアの件数は変更通知を出さないので、定期的に読む。
  const read = () => ({
    connections: props.readLayer.manager.connectionCount,
    peakConnections: props.readLayer.manager.peakConnectionCount,
    storedEvents: props.readLayer.store.size,
  });
  const [stats, setStats] = createSignal(read());
  const timer = setInterval(() => setStats(read()), 1_000);
  onCleanup(() => clearInterval(timer));

  return (
    <div class="flex flex-col gap-6 p-4 font-mono text-sm">
      <Section title="connections">
        <Rows rows={Object.entries(stats())} />
      </Section>

      <Section title="warm-up">
        <Show when={diagnostics.warmUp} fallback={<p class="opacity-70">-</p>}>
          {(warmUp) => (
            <>
              <Rows
                rows={[
                  ["total", ms(warmUp().totalMs)],
                  ["phase1 (kind:3)", ms(warmUp().phase1Ms)],
                  ["phase2 (kind:10002)", ms(warmUp().phase2Ms)],
                  ["followees", warmUp().followees.length],
                  ["routed", warmUp().routed],
                  ["unroutable", warmUp().unroutable],
                ]}
              />
              {/* 所要時間は最も遅いリレーで決まるので、遅い順に並べる。 */}
              <Rows
                rows={[...warmUp().phase1Relays, ...warmUp().phase2Relays]
                  .sort((a, b) => b.ms - a.ms)
                  .map((settle) => [
                    settle.url,
                    `${ms(settle.ms)} ${settle.reason}`,
                  ])}
              />
            </>
          )}
        </Show>
      </Section>

      <Section title="sections">
        <For
          each={Object.entries(diagnostics.sections)}
          fallback={<p class="opacity-70">-</p>}
        >
          {([id, status]) => (
            <Rows
              rows={[
                ["id", id],
                ["phase", status.phase],
                ["items", status.items],
                ["incomplete", JSON.stringify(status.incomplete ?? {})],
              ]}
            />
          )}
        </For>
      </Section>
    </div>
  );
};

export default ReadLayerPanel;
