import type { ReadLayer } from "@streets/core/read/read-layer";
import { type Component, For, createSignal, onCleanup } from "solid-js";

type Stats = {
  connections: number;
  peakConnections: number;
  storedEvents: number;
};

const read = (layer: ReadLayer): Stats => ({
  connections: layer.manager.connectionCount,
  peakConnections: layer.manager.peakConnectionCount,
  storedEvents: layer.store.size,
});

// 読み取り層は変更通知を外へ出していないので、パネルを開いている間だけ定期的に読む。
const ReadLayerPanel: Component<{ readLayer: ReadLayer }> = (props) => {
  const [stats, setStats] = createSignal(read(props.readLayer));
  const timer = setInterval(() => setStats(read(props.readLayer)), 1_000);
  onCleanup(() => clearInterval(timer));

  return (
    <dl class="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 p-4 font-mono text-sm">
      <For each={Object.entries(stats())}>
        {([key, value]) => (
          <>
            <dt class="opacity-70">{key}</dt>
            <dd>{value}</dd>
          </>
        )}
      </For>
    </dl>
  );
};

export default ReadLayerPanel;
