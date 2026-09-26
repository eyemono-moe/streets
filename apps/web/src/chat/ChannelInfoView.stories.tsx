import type { Channel } from "@streets/core/nostr/channel";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { EventSceneProvider } from "../storybook/EventScene";
import { createStoryAuthor } from "../storybook/story-events";
import ChannelInfoView from "./ChannelInfoView";

const mama = createStoryAuthor(22, { name: "mama", displayName: "ママ" });
const channel: Channel = {
  id: "1".repeat(64),
  creator: mama.pubkey,
  metadata: {
    name: "さびれたスナック",
    about: "夜にだらだら話す場所。だれでもどうぞ。\n宣伝はミュートします。",
    relays: ["wss://relay.example/", "wss://relay-jp.example/"],
  },
  updatedAt: 0,
};

type Props = Parameters<typeof ChannelInfoView>[0];

const meta = {
  title: "チャット/チャンネルの情報",
  component: (props: Props) => (
    <EventSceneProvider scene={{ events: [mama.profile()] }}>
      <div class="w-95 border border-primary bg-primary">
        <ChannelInfoView {...props} />
      </div>
    </EventSceneProvider>
  ),
  args: {
    channel,
    settled: true,
    favorite: true,
    signedIn: true,
    editable: false,
  },
  argTypes: { channel: { control: false } },
} satisfies Meta<Props>;

export default meta;
type Story = StoryObj<typeof meta>;

export const 通常: Story = {};
export const 自分が作った: Story = { args: { editable: true } };
export const ログインしていない: Story = { args: { signedIn: false } };
export const リレーが書かれていない: Story = {
  args: {
    channel: { ...channel, metadata: { ...channel.metadata, relays: [] } },
  },
};
export const 名前も説明も無い: Story = {
  args: { channel: { ...channel, metadata: { relays: [] } } },
};
export const 読み込み中: Story = {
  args: { channel: undefined, settled: false },
};
export const 見つからない: Story = { args: { channel: undefined } };
export const 狭いカラム: Story = {
  parameters: { viewport: { defaultViewport: "column320" } },
};
