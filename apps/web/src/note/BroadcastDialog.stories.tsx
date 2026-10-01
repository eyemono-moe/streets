import type { RelayListEntry } from "@streets/core/read/relay-list";
import type { RelayUrl } from "@streets/core/relay/relay-connection";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { BroadcastDialogView, type BroadcastTarget } from "./BroadcastDialog";

type Args = {
  mine: readonly RelayUrl[];
  author: readonly RelayUrl[];
  target?: BroadcastTarget;
  custom?: readonly RelayUrl[];
};

const relays = (...urls: string[]) => urls as RelayUrl[];

const account: RelayListEntry[] = [
  { url: "wss://yabu.me/" as RelayUrl, read: true, write: true },
  { url: "wss://nos.lol/" as RelayUrl, read: false, write: true },
];
const followeeWriteRelays = [
  relays("wss://relay.nostr.band/", "wss://yabu.me/"),
  relays("wss://relay.nostr.band/", "wss://nostr.wine/"),
];

const Story = (props: Args) => (
  <BroadcastDialogView
    candidates={{ mine: props.mine, author: props.author }}
    initialTarget={props.target}
    account={account}
    followeeWriteRelays={followeeWriteRelays}
    initialCustom={props.custom}
    onSend={() => {}}
    onClose={() => {}}
  />
);

const meta = {
  title: "イベント/投稿/ほかのリレーにも送る",
  component: Story,
  args: {
    mine: relays("wss://relay.damus.io/", "wss://nos.lol/", "wss://yabu.me/"),
    author: relays("wss://relay.nostr.band/", "wss://relay.primal.net/"),
  },
} satisfies Meta<Args>;

export default meta;
type S = StoryObj<typeof meta>;

export const 自分のリレー: S = {};

export const 投稿した人のリレー: S = { args: { target: "author" } };

/** その人のリレーの一覧がまだ無い・公開されていない。送れない。 */
export const 送り先が分からない: S = { args: { target: "author", author: [] } };

export const 選ぶ: S = {
  args: { target: "custom", custom: relays("wss://relay.example/") },
};

/** まだ 1 本も選んでいない。送れない。 */
export const まだ選んでいない: S = { args: { target: "custom" } };

export const 送り先が多い: S = {
  args: {
    mine: relays(
      ...Array.from(
        { length: 12 },
        (_, i) => `wss://relay-${i}.a-very-long-relay-domain.example/path/`,
      ),
    ),
  },
};

export const 狭い画面: S = {
  parameters: { viewport: { defaultViewport: "mobile1" } },
};
