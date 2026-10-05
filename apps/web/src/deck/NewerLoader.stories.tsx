import type { Meta, StoryObj } from "storybook-solidjs-vite";
import NewerLoader from "./NewerLoader";

const meta = {
  title: "デッキ/新しい投稿の取り足し",
  component: NewerLoader,
  render: (props) => (
    <div class="w-95 overflow-y-auto border border-primary bg-primary">
      <NewerLoader {...props} />
    </div>
  ),
  args: { paging: "idle", onReach: () => {} },
  argTypes: { onReach: { control: false } },
} satisfies Meta<typeof NewerLoader>;

export default meta;
type Story = StoryObj<typeof meta>;

/** 取れる間は何も出さない。高さだけは保ち、状態が変わっても一覧を動かさない。 */
export const 取り足せる: Story = {};
export const 読み込み中: Story = { args: { paging: "loading" } };
export const 追いついた: Story = { args: { paging: "caught-up" } };
/** 返事をしないリレーがあって、その区間を取り切れたか分からない。 */
export const 読み込めなかった: Story = { args: { paging: "failed" } };
export const 狭いカラムで読み込めなかった: Story = {
  args: { paging: "failed" },
  parameters: { viewport: { defaultViewport: "column320" } },
};
