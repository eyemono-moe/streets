import type { RelayUrl } from "@streets/core/relay/relay-connection";
import {
  type RelayDiscovery,
  recommendRelays,
} from "@streets/core/settings/relay-recommendation";
import { createSignal } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { EventSceneProvider } from "../storybook/EventScene";
import { Mediates } from "../ui-events";
import RelayRecommendationsView, {
  type RecommendationState,
} from "./RelayRecommendationsView";

type Args = {
  phase: RecommendationState["phase"];
  discovery: "loading" | "ready" | "missing";
  /** 置く幅。狭いカラムや携帯の幅を見る。 */
  width: number;
};

const url = (host: string) => `wss://${host}/` as RelayUrl;

const users = new Map<RelayUrl, number>([
  [url("relay.damus.io"), 412],
  [url("nos.lol"), 380],
  [url("yabu.me"), 210],
  [url("relay-jp.nostr.wirednet.jp"), 160],
  [url("relay.nostr.band"), 150],
  [url("nostr.wine"), 60],
  [
    url("very-long-subdomain-for-a-community-relay.example-nostr-provider.com"),
    8,
  ],
]);

const discoveries = new Map<RelayUrl, RelayDiscovery>([
  [
    url("relay.damus.io"),
    {
      url: url("relay.damus.io"),
      rttRead: 420,
      nips: [1, 9, 11, 40],
      measuredAt: 0,
    },
  ],
  [
    url("nos.lol"),
    { url: url("nos.lol"), rttRead: 180, nips: [1, 11], measuredAt: 0 },
  ],
  [
    url("yabu.me"),
    { url: url("yabu.me"), rttRead: 90, nips: [1, 9, 11], measuredAt: 0 },
  ],
  [
    url("relay.nostr.band"),
    { url: url("relay.nostr.band"), rttOpen: 3400, nips: [], measuredAt: 0 },
  ],
  [
    url("nostr.wine"),
    {
      url: url("nostr.wine"),
      rttRead: 250,
      nips: [1, 9, 11, 42],
      payment: true,
      auth: true,
      measuredAt: 0,
    },
  ],
]);

const Story = (props: Args) => {
  const [own, setOwn] = createSignal([
    { url: url("relay.damus.io"), read: true, write: true },
  ]);
  const state = (): RecommendationState =>
    props.phase === "ready"
      ? {
          phase: "ready",
          discovery: props.discovery,
          items: recommendRelays({
            candidates: [...users.keys()],
            users,
            followees: 800,
            discoveries: props.discovery === "ready" ? discoveries : new Map(),
            own: own(),
          }),
        }
      : { phase: props.phase };

  return (
    <EventSceneProvider scene={{ events: [] }}>
      <Mediates
        handle={(event) => {
          if (event.type !== "relays/edit" || event.op.type !== "add") {
            return false;
          }
          const op = event.op;
          setOwn((current) => [
            ...current,
            {
              url: op.url,
              read: op.usage !== "write",
              write: op.usage !== "read",
            },
          ]);
          return true;
        }}
      >
        <div class="bg-primary p-6" style={{ width: `${props.width}px` }}>
          <RelayRecommendationsView state={state()} infoOf={() => undefined} />
        </div>
      </Mediates>
    </EventSceneProvider>
  );
};

const meta = {
  title: "設定/おすすめのリレー",
  component: Story,
  args: { phase: "ready", discovery: "ready", width: 660 },
  argTypes: {
    phase: {
      control: "inline-radio",
      options: ["loading", "no-followees", "empty", "ready"],
    },
    discovery: {
      control: "inline-radio",
      options: ["loading", "ready", "missing"],
    },
  },
} satisfies Meta<Args>;

export default meta;
type S = StoryObj<typeof meta>;

/** 計測が揃っている。支払いが要るリレーは人が多くても下がる。「追加」で「使っています」に変わる。 */
export const いつもの: S = {};

export const 計測を調べている途中: S = { args: { discovery: "loading" } };

/** 計測の置き場から何も得られなかった。人数だけで並べる。 */
export const 計測なし: S = { args: { discovery: "missing" } };

export const 集めている途中: S = { args: { phase: "loading" } };

export const フォローなし: S = { args: { phase: "no-followees" } };

/** フォロー中の人が誰もリレーの設定を公開していない。 */
export const 候補なし: S = { args: { phase: "empty" } };

export const 狭い幅: S = { args: { width: 340 } };
