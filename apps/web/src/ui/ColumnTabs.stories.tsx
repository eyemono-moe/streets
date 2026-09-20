import type { Meta, StoryObj } from "storybook-solidjs-vite";
import ColumnTabs from "./ColumnTabs";

const meta = {
  title: "UI/ColumnTabs",
  component: ColumnTabs,
  args: {
    label: "表示する内容",
    tabs: [
      {
        value: "notes",
        label: "投稿",
        count: 12,
        content: () => <p class="c-secondary p-4">投稿の一覧</p>,
      },
      {
        value: "reactions",
        label: "リアクション",
        count: 3,
        content: () => <p class="c-secondary p-4">リアクションの一覧</p>,
      },
    ],
  },
} satisfies Meta<typeof ColumnTabs>;

export default meta;
type Story = StoryObj<typeof meta>;

export const 通常: Story = {};
export const 狭いカラム: Story = {
  decorators: [
    (Story) => (
      <div class="w-72">
        <Story />
      </div>
    ),
  ],
};
