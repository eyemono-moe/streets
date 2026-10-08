import { buildChannelMessage } from "@streets/core/nostr/build/channel";
import {
  type ChatMuteKind,
  type ChatMuteScope,
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
const open = (kind: ChatMuteKind, scope: ChatMuteScope) =>
  chatMuteTransition(
    chatMuteTransition(
      chatMuteTransition(closedChatMute(), {
        type: "chat-mute/open",
        messageId: message.id,
        pubkey: other.pubkey,
      }),
      { type: "chat-mute/kind", value: kind },
    ),
    { type: "chat-mute/scope", value: scope },
  );

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
  args: { state: open("message", "channel") },
  argTypes: { state: { control: false } },
} satisfies Meta<Props>;

export default meta;
type Story = StoryObj<typeof meta>;

export const 発言をこのチャンネルだけ: Story = {};
export const 人をこのチャンネルだけ: Story = {
  args: { state: open("user", "channel") },
};
export const 発言をどこでも: Story = {
  args: { state: open("message", "everywhere") },
};
export const 人をどこでも: Story = {
  args: { state: open("user", "everywhere") },
};
export const 送っている: Story = {
  args: {
    state: chatMuteTransition(
      chatMuteTransition(open("message", "channel"), {
        type: "chat-mute/reason",
        value: "宣伝",
      }),
      { type: "chat-mute/submit" },
    ),
  },
};
