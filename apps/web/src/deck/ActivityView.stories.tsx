import type { EventActivity } from "@streets/core/view/event-activity";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { EventSceneProvider } from "../storybook/EventScene";
import { createStoryAuthor } from "../storybook/story-events";
import ActivityView from "./ActivityView";

const alice = createStoryAuthor(11, {
  name: "alice",
  displayName: "リポストしたひと",
});
const bob = createStoryAuthor(22, {
  name: "bob",
  displayName: "引用したひと",
});
const carol = createStoryAuthor(33, {
  name: "carol",
  displayName: "リアクションしたひと",
});

const activity: EventActivity = {
  reposts: [alice.pubkey],
  quotes: [bob.pubkey],
  reactions: [
    {
      pubkey: carol.pubkey,
      contents: [{ type: "like" }, { type: "text", content: "🎉" }],
    },
  ],
};

type Props = {
  activity: EventActivity;
  settled: boolean;
  incomplete: boolean;
};

const meta = {
  title: "カラム/イベントのアクティビティ",
  component: (props: Props) => (
    <EventSceneProvider
      scene={{ events: [alice.profile(), bob.profile(), carol.profile()] }}
    >
      <div class="w-full bg-primary">
        <ActivityView {...props} />
      </div>
    </EventSceneProvider>
  ),
  args: { activity, settled: true, incomplete: false },
  argTypes: { activity: { control: false } },
} satisfies Meta<Props>;

export default meta;
type Story = StoryObj<typeof meta>;

export const 通常: Story = {};
export const 取得中: Story = {
  args: {
    activity: { reposts: [], quotes: [], reactions: [] },
    settled: false,
  },
};
export const 空: Story = {
  args: {
    activity: { reposts: [], quotes: [], reactions: [] },
  },
};
export const 一部取得失敗: Story = { args: { incomplete: true } };
export const 取得失敗: Story = {
  args: {
    activity: { reposts: [], quotes: [], reactions: [] },
    incomplete: true,
  },
};
export const 狭いカラム: Story = {
  parameters: { viewport: { defaultViewport: "column320" } },
};
