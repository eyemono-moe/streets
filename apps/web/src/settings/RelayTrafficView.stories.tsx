import type { RelayUrl } from "@streets/core/relay/relay-connection";
import type {
  RelayTrafficSummary,
  TrafficSummary,
} from "@streets/core/relay/relay-traffic";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { EventSceneProvider } from "../storybook/EventScene";
import { Mediates } from "../ui-events";
import RelayTrafficView from "./RelayTrafficView";

type Args = {
  summary: TrafficSummary;
  elapsedMs: number;
  width: number;
};

const MB = 1024 * 1024;

const relay = (
  host: string,
  megabytes: number,
  events: number,
  duplicateRate: number,
  extra: Partial<RelayTrafficSummary> = {},
): RelayTrafficSummary => ({
  url: `wss://${host}/` as RelayUrl,
  open: true,
  received: Math.round(megabytes * MB),
  receivedEvents: Math.round(megabytes * MB * 0.96),
  sent: Math.round(megabytes * MB * 0.03),
  events,
  duplicates: Math.round(events * duplicateRate),
  connectedMs: 31 * 60_000,
  reconnects: 0,
  subscriptions: 8,
  peakSubscriptions: 14,
  queuedReqs: 0,
  kinds:
    events === 0
      ? []
      : [
          { kind: 1, count: Math.round(events * 0.62), bytes: 0 },
          { kind: 7, count: Math.round(events * 0.21), bytes: 0 },
          { kind: 0, count: Math.round(events * 0.09), bytes: 0 },
          { kind: 6, count: Math.round(events * 0.04), bytes: 0 },
          { kind: 9735, count: Math.round(events * 0.02), bytes: 0 },
          { kind: 30023, count: Math.round(events * 0.01), bytes: 0 },
          { kind: 31990, count: Math.round(events * 0.01), bytes: 0 },
        ],
  ...extra,
});

const total = (relays: RelayTrafficSummary[]): TrafficSummary => ({
  received: relays.reduce((sum, r) => sum + r.received, 0),
  sent: relays.reduce((sum, r) => sum + r.sent, 0),
  events: relays.reduce((sum, r) => sum + r.events, 0),
  duplicates: relays.reduce((sum, r) => sum + r.duplicates, 0),
  relays,
});

const busy = total([
  relay("relay.damus.io", 12.4, 18_204, 0.41, {
    reconnects: 2,
    peakSubscriptions: 20,
    queuedReqs: 4,
  }),
  relay("nos.lol", 9.8, 14_051, 0.37),
  relay("yabu.me", 7.1, 9_876, 0.44),
  relay("relay-jp.nostr.wirednet.jp", 6.3, 8_820, 0.52),
  relay("relay.nostr.band", 3.2, 2_904, 0.12),
  relay("nostrja-kari.heguro.com", 0.017, 0, 0, { open: false }),
]);

const Story = (props: Args) => (
  <EventSceneProvider scene={{ events: [] }}>
    <Mediates handle={(event) => event.type === "stats/reset-traffic"}>
      <div class="bg-primary p-6" style={{ width: `${props.width}px` }}>
        <RelayTrafficView
          summary={props.summary}
          since={Date.UTC(2026, 9, 14, 1, 12)}
          elapsedMs={props.elapsedMs}
          statusOf={(url) =>
            url === "wss://relay.nostr.band/"
              ? "failing"
              : url === "wss://nostrja-kari.heguro.com/"
                ? "idle"
                : "in-use"
          }
          infoOf={() => undefined}
        />
      </div>
    </Mediates>
  </EventSceneProvider>
);

const meta = {
  title: "設定/リレーとの通信量",
  component: Story,
  args: { summary: busy, elapsedMs: 32 * 60_000, width: 660 },
  argTypes: { summary: { control: false } },
} satisfies Meta<Args>;

export default meta;
type S = StoryObj<typeof meta>;

/** 30 分ほど使ったところ。多いリレーから並び、つながっているのに何も返さないリレーも見える。 */
export const いつもの: S = {};

/** 開いた直後で、まだどのリレーともやりとりしていない。 */
export const 何もない: S = {
  args: { summary: total([]), elapsedMs: 4_000 },
};

/** 長く開いていた。 */
export const 長く使った: S = {
  args: { elapsedMs: 3 * 3_600_000 + 20 * 60_000 },
};

export const 狭い幅: S = { args: { width: 340 } };
