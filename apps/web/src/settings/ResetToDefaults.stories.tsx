import type { Meta, StoryObj } from "storybook-solidjs-vite";
import ResetToDefaults from "./ResetToDefaults";

type Args = { isDefault: boolean; confirming: boolean; width: number };

const Story = (props: Args) => (
  <div class="bg-primary p-6" style={{ width: `${props.width}px` }}>
    <ResetToDefaults
      description="この端末に保存した表示の設定を、はじめの状態に戻します。アカウントに保存したアクセントカラーは戻しません。"
      isDefault={props.isDefault}
      initialConfirming={props.confirming}
      onReset={() => {}}
    />
  </div>
);

const meta = {
  title: "設定/既定に戻す",
  component: Story,
  args: { isDefault: false, confirming: false, width: 660 },
} satisfies Meta<Args>;

export default meta;
type S = StoryObj<typeof meta>;

export const いつもの: S = {};
/** 何も変えていないので押せない。 */
export const 既定のまま: S = { args: { isDefault: true } };
export const 確かめている: S = { args: { confirming: true } };
export const 狭い幅: S = { args: { confirming: true, width: 340 } };
