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
export const カラムごとスクロール: Story = {
  args: {
    scroll: "column",
    tabs: [
      {
        value: "notes",
        label: "投稿",
        content: () => (
          <div class="flex flex-col">
            {Array.from({ length: 40 }, (_, index) => (
              <p class="c-secondary border-primary border-b p-4">
                投稿 {index + 1}
              </p>
            ))}
          </div>
        ),
      },
      {
        value: "reactions",
        label: "リアクション",
        content: () => <p class="c-secondary p-4">リアクションの一覧</p>,
      },
    ],
  },
  decorators: [
    // 上のプロフィールごとスクロールし、タブの並びは上端に留まる。
    (Story) => (
      <div data-scroll-container class="h-120 w-80 overflow-y-auto bg-primary">
        <div class="c-secondary h-40 bg-secondary p-4">プロフィール</div>
        <Story />
      </div>
    ),
  ],
};
