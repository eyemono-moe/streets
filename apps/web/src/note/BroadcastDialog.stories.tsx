import type { RelayUrl } from "@streets/core/relay/relay-connection";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { BroadcastDialogView, type BroadcastTarget } from "./BroadcastDialog";

type Args = {
  mine: readonly RelayUrl[];
  inbox: readonly RelayUrl[];
  target?: BroadcastTarget;
  custom?: string;
};

const relays = (...urls: string[]) => urls as RelayUrl[];

const Story = (props: Args) => (
  <BroadcastDialogView
    candidates={{ mine: props.mine, inbox: props.inbox }}
    initialTarget={props.target}
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
    inbox: relays("wss://relay.nostr.band/"),
  },
} satisfies Meta<Args>;

export default meta;
type S = StoryObj<typeof meta>;

export const 自分のリレー: S = {};

export const 投稿した人のリレー: S = { args: { target: "inbox" } };

/** その人のリレーの一覧がまだ無い・公開されていない。送れない。 */
export const 送り先が分からない: S = { args: { target: "inbox", inbox: [] } };

export const 指定する: S = {
  args: { target: "custom", custom: "wss://relay.example/" },
};

export const 指定したURLが読めない: S = {
  args: { target: "custom", custom: "https://relay.example/" },
};

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
