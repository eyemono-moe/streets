import type { ComposeState } from "@streets/core/view/compose";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import SidePanel from "../deck/SidePanel";
import { EventSceneProvider } from "../storybook/EventScene";
import avatarUrl from "../storybook/avatar-fixture.svg";
import { createStoryAuthor } from "../storybook/story-events";
import ComposePanel from "./ComposePanel";

const viewer = createStoryAuthor(55, {
  name: "me",
  displayName: "わたし",
  picture: avatarUrl,
});

const meta = {
  title: "操作/投稿パネル",
  component: (props: { state: ComposeState }) => (
    <EventSceneProvider scene={{ events: [viewer.profile()], viewer }}>
      {/* サイドバーに開いたときと同じ幅・高さに載せる。 */}
      <div class="flex h-[640px]">
        <SidePanel
          title="ノートを書く"
          icon="i-material-symbols:edit-square-outline-rounded"
        >
          <ComposePanel state={props.state} />
        </SidePanel>
      </div>
    </EventSceneProvider>
  ),
  args: { state: { content: "", sending: false } },
} satisfies Meta<{ state: ComposeState }>;

export default meta;
type Story = StoryObj<typeof meta>;

export const 空: Story = {};

export const 書きかけ: Story = {
  args: {
    state: {
      content: "プレビューに出る本文。 #nostr https://example.com/",
      sending: false,
    },
  },
};

export const 送信中: Story = {
  args: { state: { content: "送っている途中のノート。", sending: true } },
};

export const 長い本文: Story = {
  args: {
    state: {
      content: Array.from(
        { length: 14 },
        (_, index) =>
          `${index + 1} 行目。テキストエリアが伸びる上限と、プレビューのスクロールを確かめる。`,
      ).join("\n"),
      sending: false,
    },
  },
};
