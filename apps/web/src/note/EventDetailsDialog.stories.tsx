import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { EventSceneProvider } from "../storybook/EventScene";
import { createStoryAuthor } from "../storybook/story-events";
import EventDetailsDialog from "./EventDetailsDialog";

const author = createStoryAuthor(77, {
  name: "author",
  displayName: "書いた人",
});
const target = author.note("詳細を見るノート。\nhttps://example.com/", [
  ["t", "nostr"],
]);

const meta = {
  title: "操作/イベントの詳細",
  component: () => (
    <EventSceneProvider scene={{ events: [author.profile(), target] }}>
      <EventDetailsDialog event={target} onClose={() => {}} />
    </EventSceneProvider>
  ),
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const 通常: Story = {};
