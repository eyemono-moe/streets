import type { RelayUrl } from "@streets/core/relay/relay-connection";
import {
  type ChannelFormState,
  channelFormTransition,
  closedChannelForm,
} from "@streets/core/view/channel-form";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { Mediates } from "../ui-events";
import ChannelFormDialog from "./ChannelFormDialog";

const RELAY = "wss://relay.example/" as RelayUrl;
const run = (...events: Parameters<typeof channelFormTransition>[1][]) =>
  events.reduce(channelFormTransition, closedChannelForm());

const creating = run({ type: "channel-form/open-create", relays: [RELAY] });
const named = channelFormTransition(creating, {
  type: "channel-form/input",
  field: "name",
  value: "日本語のチャンネル",
});

type Props = { form: ChannelFormState };

const meta = {
  title: "チャット/チャンネルを作る・直す",
  component: (props: Props) => (
    // 裁定する段は置かない。押しても何も起きない、見た目だけのカタログ。
    <Mediates handle={() => true}>
      <ChannelFormDialog
        form={props.form}
        account={[
          { url: RELAY, read: true, write: true },
          { url: "wss://inbox.example/" as RelayUrl, read: true, write: false },
        ]}
      />
    </Mediates>
  ),
  args: { form: creating },
  argTypes: { form: { control: false } },
} satisfies Meta<Props>;

export default meta;
type Story = StoryObj<typeof meta>;

export const 作る: Story = {};
export const 名前を書いた: Story = { args: { form: named } };
export const 書きかけのまま閉じようとした: Story = {
  args: { form: channelFormTransition(named, { type: "channel-form/close" }) },
};
export const 送っている: Story = {
  args: { form: channelFormTransition(named, { type: "channel-form/submit" }) },
};
export const 直す: Story = {
  args: {
    form: run({
      type: "channel-form/open-edit",
      channel: {
        id: "1".repeat(64),
        creator: "c".repeat(64),
        metadata: {
          name: "さびれたスナック",
          about: "夜にだらだら話す場所",
          relays: [RELAY],
        },
        updatedAt: 0,
      },
    }),
  },
};
