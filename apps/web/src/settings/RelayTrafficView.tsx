import { kindLabel } from "@streets/core/nostr/kind-support";
import type { RelayStatus } from "@streets/core/read/connection-pool";
import type { RelayUrl } from "@streets/core/relay/relay-connection";
import type { RelayInfo } from "@streets/core/relay/relay-info";
import type {
  RelayTrafficSummary,
  TrafficSummary,
} from "@streets/core/relay/relay-traffic";
import { type Component, For, type JSX, Show } from "solid-js";
import { useDispatch } from "../ui-events";
import Button from "../ui/Button";
import RelaySummary from "./RelaySummary";
import SettingsSection from "./SettingsSection";

export type RelayTrafficViewProps = {
  summary: TrafficSummary;
  /** 数え始めた時刻（ms）。 */
  since: number;
  /** 数え始めてからの長さ（ms）。 */
  elapsedMs: number;
  statusOf?: (url: RelayUrl) => RelayStatus;
  infoOf?: (url: RelayUrl) => RelayInfo | undefined;
};

/** 種類ごとの内訳に出す数。残りは「そのほか」にまとめる。 */
const KINDS_SHOWN = 5;

const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};

const formatDuration = (ms: number): string => {
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return `${Math.max(0, Math.round(ms / 1000))} 秒`;
  if (minutes < 60) return `${minutes} 分`;
  return `${Math.floor(minutes / 60)} 時間 ${minutes % 60} 分`;
};

const formatTime = (ms: number): string =>
  new Date(ms).toLocaleTimeString("ja-JP", {
    hour: "2-digit",
    minute: "2-digit",
  });

const percent = (part: number, whole: number) =>
  whole === 0 ? 0 : Math.round((part / whole) * 100);

const count = (value: number) => value.toLocaleString("ja-JP");

/** リレーごとの通信量。見るだけで、変えられるのは数え直すことだけ。 */
const RelayTrafficView: Component<RelayTrafficViewProps> = (props) => {
  const dispatch = useDispatch();
  const largest = () => props.summary.relays[0]?.received ?? 0;

  return (
    <SettingsSection
      id="relayTraffic"
      description="このタブを開いてから、リレーとやりとりしたデータの量です。多いリレーから順に並べます。回線で圧縮される前の大きさで数えます。"
    >
      <div class="flex flex-wrap items-center justify-between gap-2">
        <span class="c-secondary text-caption">
          {`${formatTime(props.since)} から（${formatDuration(props.elapsedMs)}）`}
        </span>
        <Button
          size="sm"
          onClick={() => dispatch({ type: "stats/reset-traffic" })}
        >
          数え直す
        </Button>
      </div>
      <dl class="grid grid-cols-[repeat(auto-fit,minmax(8rem,1fr))] gap-2">
        <Total label="受け取った" value={formatBytes(props.summary.received)} />
        <Total label="送った" value={formatBytes(props.summary.sent)} />
        <Total label="イベント" value={count(props.summary.events)} />
        <Total
          label="重複"
          value={`${percent(props.summary.duplicates, props.summary.events)}%`}
          note="別のリレーから先に受け取っていたもの"
        />
      </dl>
      <Show
        when={props.summary.relays.length > 0}
        fallback={
          <p class="c-secondary rounded-2 border border-primary p-3 text-caption">
            まだどのリレーともやりとりしていません。
          </p>
        }
      >
        <ul class="flex flex-col overflow-hidden rounded-2 border border-primary [&>*+*]:border-t [&>*]:border-primary">
          <For each={props.summary.relays}>
            {(relay) => (
              <li class="bg-primary">
                <RelaySummary
                  url={relay.url}
                  info={props.infoOf?.(relay.url)}
                  loadInfo={props.infoOf === undefined}
                  status={props.statusOf?.(relay.url)}
                  subtitle={<Amount relay={relay} largest={largest()} />}
                  actions={
                    <span class="c-primary shrink-0 font-600 text-caption tabular-nums">
                      {formatBytes(relay.received)}
                    </span>
                  }
                  details={() => <Breakdown relay={relay} />}
                />
              </li>
            )}
          </For>
        </ul>
      </Show>
    </SettingsSection>
  );
};

const Total: Component<{ label: string; value: string; note?: string }> = (
  props,
) => (
  <div class="flex flex-col gap-0.5 rounded-2 bg-secondary p-3">
    <dt class="c-secondary text-caption">{props.label}</dt>
    <dd class="c-primary font-700 text-body tabular-nums">{props.value}</dd>
    <Show when={props.note}>
      {(note) => <dd class="c-secondary text-xs">{note()}</dd>}
    </Show>
  </div>
);

const Bar: Component<{ ratio: number; class?: string }> = (props) => (
  <span
    class={`block h-1.5 overflow-hidden rounded-full bg-secondary ${props.class ?? ""}`}
    aria-hidden="true"
  >
    <span
      class="block h-full rounded-full bg-accent-5"
      style={{ width: `${Math.max(1, Math.round(props.ratio * 100))}%` }}
    />
  </span>
);

const Amount: Component<{ relay: RelayTrafficSummary; largest: number }> = (
  props,
) => (
  <span class="mt-1 flex flex-col gap-1">
    <Bar
      ratio={props.largest === 0 ? 0 : props.relay.received / props.largest}
      class="w-full max-w-72"
    />
    <span class="c-secondary text-caption">
      {props.relay.events === 0
        ? "受け取ったイベントはありません"
        : `イベント ${count(props.relay.events)}・重複 ${percent(props.relay.duplicates, props.relay.events)}%`}
    </span>
  </span>
);

const Row: Component<{ label: string; children: JSX.Element }> = (props) => (
  <>
    <dt class="c-secondary">{props.label}</dt>
    <dd class="c-primary min-w-0">{props.children}</dd>
  </>
);

const Breakdown: Component<{ relay: RelayTrafficSummary }> = (props) => {
  const kinds = () => {
    const shown = props.relay.kinds.slice(0, KINDS_SHOWN);
    const rest = props.relay.kinds
      .slice(KINDS_SHOWN)
      .reduce((sum, kind) => sum + kind.count, 0);
    return rest > 0
      ? [
          ...shown.map((kind) => ({
            label: kindLabel(kind.kind),
            count: kind.count,
          })),
          { label: "そのほか", count: rest },
        ]
      : shown.map((kind) => ({
          label: kindLabel(kind.kind),
          count: kind.count,
        }));
  };
  return (
    <dl class="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1.5 px-3 pb-3 pl-14 text-caption">
      <Row label="受け取った">
        {`${formatBytes(props.relay.received)}（イベント ${formatBytes(props.relay.receivedEvents)}・そのほか ${formatBytes(props.relay.received - props.relay.receivedEvents)}）`}
      </Row>
      <Row label="送った">{formatBytes(props.relay.sent)}</Row>
      <Row label="つないでいた時間">
        {props.relay.reconnects > 0
          ? `${formatDuration(props.relay.connectedMs)}（つなぎ直し ${props.relay.reconnects} 回）`
          : formatDuration(props.relay.connectedMs)}
      </Row>
      <Row label="同時の購読">
        {`いま ${props.relay.subscriptions}・いちばん多いとき ${props.relay.peakSubscriptions}`}
      </Row>
      <Show when={props.relay.queuedReqs > 0}>
        <Row label="待たせた取得">
          {`${props.relay.queuedReqs} 回（リレーが同時に受ける購読の数に達していた）`}
        </Row>
      </Show>
      <Show when={props.relay.events > 0}>
        <Row label="イベントの種類">
          <ul class="flex flex-col gap-1">
            <For each={kinds()}>
              {(kind) => (
                <li class="grid grid-cols-[6rem_minmax(0,1fr)_3rem] items-center gap-2">
                  <span class="truncate">{kind.label}</span>
                  <Bar ratio={kind.count / props.relay.events} />
                  <span class="c-secondary text-right tabular-nums">
                    {`${percent(kind.count, props.relay.events)}%`}
                  </span>
                </li>
              )}
            </For>
          </ul>
        </Row>
      </Show>
    </dl>
  );
};

export default RelayTrafficView;
