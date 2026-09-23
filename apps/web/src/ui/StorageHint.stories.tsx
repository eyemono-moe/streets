import type { Meta, StoryObj } from "storybook-solidjs-vite";
import StorageHint, { type StorageScope } from "./StorageHint";

const Story = (props: { scope: StorageScope }) => (
  <div class="flex items-center gap-1.5 p-10">
    <span class="c-secondary font-600 text-caption">カラーテーマ</span>
    <StorageHint scope={props.scope} />
  </div>
);

const meta = {
  title: "UI/StorageHint",
  component: Story,
  args: { scope: "device" },
  argTypes: {
    scope: { control: "inline-radio", options: ["device", "account"] },
  },
} satisfies Meta<{ scope: StorageScope }>;

export default meta;
type S = StoryObj<typeof meta>;

export const 端末に保存: S = {};
export const アカウントに保存: S = { args: { scope: "account" } };
