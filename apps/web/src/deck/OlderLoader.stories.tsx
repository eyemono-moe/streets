import type { Meta, StoryObj } from "storybook-solidjs-vite";
import OlderLoader from "./OlderLoader";

const meta = {
  title: "デッキ/古い投稿の取り足し",
  component: OlderLoader,
  render: (props) => (
    <div class="w-95 overflow-y-auto border border-primary bg-primary">
      <OlderLoader {...props} />
    </div>
  ),
  args: { paging: "idle", onReach: () => {} },
  argTypes: { onReach: { control: false } },
} satisfies Meta<typeof OlderLoader>;

export default meta;
type Story = StoryObj<typeof meta>;

/** 最初のページが揃うまでは取り足さない。待っていることを出す。 */
export const ほかのリレーを待っている: Story = { args: { paging: "waiting" } };
export const 取り足せる: Story = {};
export const 読み込み中: Story = { args: { paging: "loading" } };
export const もう無い: Story = { args: { paging: "exhausted" } };
export const 狭いカラム: Story = {
  args: { paging: "waiting" },
  parameters: { viewport: { defaultViewport: "column320" } },
};
