import type { RelayStatus } from "@streets/core/read/connection-pool";
import { FALLBACK_RELAYS } from "@streets/core/read/default-relays";
import type { ReadPlan, ReadPlanRelay } from "@streets/core/read/read-plan";
import type { RelayListEntry } from "@streets/core/read/relay-list";
import type { RelayUrl } from "@streets/core/relay/relay-connection";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import avatar from "../storybook/avatar-fixture.svg";
import { EventSceneProvider } from "../storybook/EventScene";
import { createStoryAuthor } from "../storybook/story-events";
import RelayPlanView from "./RelayPlanView";

type Args = {
  plan: ReadPlan | undefined;
  routingSettled: boolean;
  entries: RelayListEntry[];
  loading: boolean;
  status: Record<string, RelayStatus>;
  /** 置く幅。狭いカラムや携帯の幅を見る。 */
  width: number;
  grouping: "relay" | "person";
};

const url = (host: string) => `wss://${host}/` as RelayUrl;

const NAMES = [
  "ちょめじ",
  "あいもの",
  "かもめ",
  "ぽてと",
  "しろくま",
  "みかん",
  "こけし",
  "とても長い名前をつけている人のプロフィールの表示名",
];

/** プロフィールのある人。残りはプロフィールの無い人として、pubkey だけで並べる。 */
const people = NAMES.map((name, index) =>
  createStoryAuthor(9_100 + index, {
    displayName: name,
    picture: index % 3 === 0 ? undefined : new URL(avatar, location.href).href,
  }),
);
const profiles = people.map((person) => person.profile());

// 頭の文字がそろうと npub の短い形が全員同じになるので、番号を散らす。
const stranger = (index: number) =>
  (Math.imul(index + 1, 0x9e37_79b1) >>> 0)
    .toString(16)
    .padStart(8, "0")
    .repeat(8);

/** `count` 人。先頭の何人かはプロフィールのある人、残りはプロフィールの無い人。 */
const crowd = (count: number, offset = 0): string[] =>
  Array.from({ length: count }, (_, index) => {
    const at = index + offset;
    return at < people.length ? people[at].pubkey : stranger(at);
  });

const routed = (host: string, authors: readonly string[]): ReadPlanRelay => ({
  url: url(host),
  authors,
  fallback: false,
  explicit: false,
});

/** 公開しているリレーの数。人ごとの表示の「何本のうち何本」に使う。 */
const declared = (pubkey: string) =>
  pubkey === people[0].pubkey ? 6 : pubkey.endsWith("3") ? 1 : 3;

const nameOf = (pubkey: string) => {
  const index = people.findIndex((person) => person.pubkey === pubkey);
  return index >= 0 ? NAMES[index] : pubkey.slice(0, 8);
};

const own: RelayListEntry[] = [
  { url: url("relay.damus.io"), read: true, write: true },
  { url: url("yabu.me"), read: true, write: false },
  { url: url("nos.lol"), read: false, write: true },
];

const outboxPlan: ReadPlan = {
  mode: "outbox",
  relays: [
    routed("relay.damus.io", crowd(212)),
    routed("nos.lol", crowd(180, 1)),
    routed("relay.nostr.band", crowd(96, 40)),
    routed("relay-jp.nostr.wirednet.jp", crowd(41, 120)),
    routed("nostrja-kari.heguro.com", [people[0].pubkey]),
    {
      url: url("yabu.me"),
      authors: crowd(12, 200),
      fallback: true,
      explicit: true,
    },
    { ...routed("relay.snort.social", []), fallback: true },
  ],
  unroutableAuthors: [],
  uncoveredAuthors: [],
};

const unroutable = crowd(23, 300);
const uncovered = [people[6].pubkey, ...crowd(6, 400)];

const Story = (props: Args) => (
  <EventSceneProvider scene={{ events: profiles }}>
    <div class="bg-primary p-6" style={{ width: `${props.width}px` }}>
      <RelayPlanView
        plan={props.plan}
        routingSettled={props.routingSettled}
        entries={props.entries}
        loading={props.loading}
        fallback={FALLBACK_RELAYS}
        statusOf={(relay) => props.status[relay] ?? "in-use"}
        infoOf={() => undefined}
        declaredRelayCount={declared}
        nameOf={nameOf}
        defaultGrouping={props.grouping}
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
    grouping: "relay",
  },
  argTypes: {
    grouping: { control: "inline-radio", options: ["relay", "person"] },
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
    plan: { ...outboxPlan, unroutableAuthors: crowd(320, 300) },
  },
};

/** 探し終えても見つからない人と、上限などでどこからも読めていない人がいる。 */
export const 見つからない人と読めない人: S = {
  args: {
    plan: {
      ...outboxPlan,
      unroutableAuthors: unroutable,
      uncoveredAuthors: uncovered,
    },
  },
};

/** 読み込みリレーだけを読んでいる。 */
export const 読み込みリレーだけ: S = {
  args: {
    plan: {
      mode: "direct",
      relays: [
        routed("relay.damus.io", crowd(300)),
        routed("yabu.me", crowd(300)),
      ],
      unroutableAuthors: [],
      uncoveredAuthors: [],
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
      unroutableAuthors: [],
      uncoveredAuthors: [],
    },
  },
};

export const 狭い幅: S = {
  args: {
    width: 340,
    plan: {
      ...outboxPlan,
      unroutableAuthors: unroutable,
      uncoveredAuthors: uncovered,
    },
  },
};

/** 人ごとに並べる。読めていない人を先に置き、ほかの人は読んでいるリレーと一緒に並ぶ。 */
export const 人ごと: S = {
  args: {
    grouping: "person",
    plan: {
      ...outboxPlan,
      unroutableAuthors: unroutable,
      uncoveredAuthors: uncovered,
    },
  },
};

export const 人ごと_狭い幅: S = {
  args: { ...人ごと.args, width: 340 },
};

/** 人ごとに並べたいが、まだ誰も人を決めて読んでいない。 */
export const 人ごと_誰もいない: S = {
  args: {
    grouping: "person",
    plan: {
      mode: "outbox",
      relays: [],
      unroutableAuthors: [],
      uncoveredAuthors: [],
    },
  },
};
