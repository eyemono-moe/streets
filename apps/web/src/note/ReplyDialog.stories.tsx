import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { EventSceneProvider } from "../storybook/EventScene";
import avatarUrl from "../storybook/avatar-fixture.svg";
import { createStoryAuthor } from "../storybook/story-events";
import ReplyDialog from "./ReplyDialog";

const parent = createStoryAuthor(66, {
  name: "parent",
  displayName: "おやのひと",
});
const viewer = createStoryAuthor(55, {
  name: "me",
  displayName: "わたし",
  picture: avatarUrl,
});
const target = parent.note("返信元のノートの本文。");

const meta = {
  title: "操作/返信ダイアログ",
  component: (props: { failWrites: boolean }) => (
    <EventSceneProvider
      scene={{
        events: [parent.profile(), viewer.profile(), target],
        viewer,
        failWrites: props.failWrites,
      }}
    >
      <ReplyDialog target={target} onClose={() => {}} />
    </EventSceneProvider>
  ),
  args: { failWrites: false },
} satisfies Meta<{ failWrites: boolean }>;

export default meta;
type Story = StoryObj<typeof meta>;

export const 通常: Story = {};
export const 送信に失敗する: Story = { args: { failWrites: true } };
