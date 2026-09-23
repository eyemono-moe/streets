import type { RelayStatus } from "@streets/core/read/connection-pool";
import { FALLBACK_RELAYS } from "@streets/core/read/default-relays";
import type { ReadPlan, ReadPlanRelay } from "@streets/core/read/read-plan";
import type { RelayListEntry } from "@streets/core/read/relay-list";
import type { RelayUrl } from "@streets/core/relay/relay-connection";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { EventSceneProvider } from "../storybook/EventScene";
import RelayPlanView from "./RelayPlanView";

type Args = {
  plan: ReadPlan | undefined;
  routingSettled: boolean;
  entries: RelayListEntry[];
  loading: boolean;
  status: Record<string, RelayStatus>;
  /** 置く幅。狭いカラムや携帯の幅を見る。 */
  width: number;
};

const url = (host: string) => `wss://${host}/` as RelayUrl;

const routed = (host: string, authors: number): ReadPlanRelay => ({
  url: url(host),
  authors,
  fallback: false,
  explicit: false,
});

const own: RelayListEntry[] = [
  { url: url("relay.damus.io"), read: true, write: true },
  { url: url("yabu.me"), read: true, write: false },
  { url: url("nos.lol"), read: false, write: true },
];

const outboxPlan: ReadPlan = {
  mode: "outbox",
  relays: [
    routed("relay.damus.io", 212),
    routed("nos.lol", 180),
    routed("relay.nostr.band", 96),
    routed("relay-jp.nostr.wirednet.jp", 41),
    { url: url("yabu.me"), authors: 12, fallback: true, explicit: true },
    { ...routed("relay.snort.social", 0), fallback: true },
  ],
  unroutableAuthors: 0,
  uncoveredAuthors: 0,
};

const Story = (props: Args) => (
  <EventSceneProvider scene={{ events: [] }}>
    <div class="bg-primary p-6" style={{ width: `${props.width}px` }}>
      <RelayPlanView
        plan={props.plan}
        routingSettled={props.routingSettled}
        entries={props.entries}
        loading={props.loading}
        fallback={FALLBACK_RELAYS}
        statusOf={(relay) => props.status[relay] ?? "in-use"}
        infoOf={() => undefined}
      />
    </div>
  </EventSceneProvider>
);

const meta = {
  title: "設定/いま使っているリレー",
  component: Story,
  args: {
    plan: outboxPlan,
    routingSettled: true,
    entries: own,
    loading: false,
    status: {
      "wss://relay.nostr.band/": "failing",
      "wss://relay.snort.social/": "idle",
    },
    width: 660,
  },
  argTypes: {
    plan: { control: false },
    entries: { control: false },
    status: { control: false },
  },
} satisfies Meta<Args>;

export default meta;
type S = StoryObj<typeof meta>;

/** 人ごとに選んでいる。上の一覧に無いリレーも、読む人の数と一緒に並ぶ。 */
export const いつもの: S = {};

/** ログイン直後。フォロー中の人のリレー設定を探している途中は、欠落と言わない。 */
export const 探している途中: S = {
  args: {
    routingSettled: false,
    plan: { ...outboxPlan, unroutableAuthors: 320 },
  },
};

/** 探し終えても見つからない人と、上限などでどこからも読めていない人がいる。 */
export const 見つからない人と読めない人: S = {
  args: {
    plan: { ...outboxPlan, unroutableAuthors: 23, uncoveredAuthors: 7 },
  },
};

/** 読み込みリレーだけを読んでいる。 */
export const 読み込みリレーだけ: S = {
  args: {
    plan: {
      mode: "direct",
      relays: [routed("relay.damus.io", 300), routed("yabu.me", 300)],
      unroutableAuthors: 0,
      uncoveredAuthors: 0,
    },
  },
};

/** 自分の一覧が無い。書き込みは既定のリレーへ送っている。 */
export const 一覧なし: S = { args: { entries: [] } };

export const 読み込み中: S = { args: { plan: undefined, loading: true } };

/** カラムがまだ無いなど、何も読んでいない。 */
export const 何も読んでいない: S = {
  args: {
    plan: {
      mode: "outbox",
      relays: [],
      unroutableAuthors: 0,
      uncoveredAuthors: 0,
    },
  },
};

export const 狭い幅: S = {
  args: {
    width: 340,
    plan: { ...outboxPlan, unroutableAuthors: 23, uncoveredAuthors: 7 },
  },
};
