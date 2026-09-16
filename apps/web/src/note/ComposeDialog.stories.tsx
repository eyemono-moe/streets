import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { EventSceneProvider } from "../storybook/EventScene";
import avatarUrl from "../storybook/avatar-fixture.svg";
import { createStoryAuthor } from "../storybook/story-events";
import ComposeDialog from "./ComposeDialog";

const viewer = createStoryAuthor(55, {
  name: "me",
  displayName: "わたし",
  picture: avatarUrl,
});

const meta = {
  title: "操作/新規ノート",
  component: (props: { failWrites: boolean }) => (
    <EventSceneProvider
      scene={{
        events: [viewer.profile()],
        viewer,
        failWrites: props.failWrites,
      }}
    >
      <ComposeDialog onClose={() => {}} />
    </EventSceneProvider>
  ),
  args: { failWrites: false },
} satisfies Meta<{ failWrites: boolean }>;

export default meta;
type Story = StoryObj<typeof meta>;

export const 通常: Story = {};
export const 送信に失敗する: Story = { args: { failWrites: true } };
