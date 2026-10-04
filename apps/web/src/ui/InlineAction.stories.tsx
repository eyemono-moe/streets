import type { Meta, StoryObj } from "storybook-solidjs-vite";
import InlineAction from "./InlineAction";

const meta = {
  title: "UI/InlineAction",
  component: InlineAction,
} satisfies Meta<typeof InlineAction>;

export default meta;
type Story = StoryObj<typeof meta>;

export const 説明文の中: Story = {
  args: { label: "設定", onClick: () => {} },
  render: (args) => (
    <p class="max-w-70 leading-relaxed text-body">
      投稿が表示されない場合は、
      <InlineAction {...args} />
      の「リレー」で接続先を確認してください。
    </p>
  ),
};
