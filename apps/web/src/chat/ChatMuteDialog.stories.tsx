import { buildChannelMessage } from "@streets/core/nostr/build/channel";
import {
  type ChatMuteState,
  chatMuteTransition,
  closedChatMute,
} from "@streets/core/view/chat-mute";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { EventSceneProvider } from "../storybook/EventScene";
import { createStoryAuthor } from "../storybook/story-events";
import { Mediates } from "../ui-events";
import ChatMuteDialog from "./ChatMuteDialog";

const other = createStoryAuthor(33, {
  name: "other",
  displayName: "ほかのひと",
});
const message = other.event(
  buildChannelMessage(
    "1".repeat(64),
    "宣伝です。ここを見てください https://spam.example",
  ),
);
const open = (kind: "message" | "user") =>
  chatMuteTransition(closedChatMute(), {
    type: "chat-mute/open",
    kind,
    messageId: message.id,
    pubkey: other.pubkey,
  });

type Props = { state: ChatMuteState };

const meta = {
  title: "チャット/チャット内のミュート",
  component: (props: Props) => (
    <EventSceneProvider scene={{ events: [other.profile(), message] }}>
      <Mediates handle={() => true}>
        <ChatMuteDialog state={props.state} target={message} />
      </Mediates>
    </EventSceneProvider>
  ),
  args: { state: open("message") },
  argTypes: { state: { control: false } },
} satisfies Meta<Props>;

export default meta;
type Story = StoryObj<typeof meta>;

export const メッセージ: Story = {};
export const ユーザー: Story = { args: { state: open("user") } };
export const 送っている: Story = {
  args: {
    state: chatMuteTransition(
      chatMuteTransition(open("message"), {
        type: "chat-mute/reason",
        value: "宣伝",
      }),
      { type: "chat-mute/submit" },
    ),
  },
};
