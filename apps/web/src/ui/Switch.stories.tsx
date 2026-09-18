import { createSignal } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import StorageHint from "./StorageHint";
import Switch from "./Switch";

const Story = (props: { label: string; initial: boolean; hint: boolean }) => {
  const [checked, setChecked] = createSignal(props.initial);
  return (
    <div class="w-80 p-4">
      <Switch
        label={props.label}
        checked={checked()}
        onChange={setChecked}
        aside={props.hint ? <StorageHint scope="account" /> : undefined}
      />
    </div>
  );
};

const meta = {
  title: "UI/Switch",
  component: Story,
  args: { label: "画像・動画を展開", initial: true, hint: false },
} satisfies Meta<{ label: string; initial: boolean; hint: boolean }>;

export default meta;
type S = StoryObj<typeof meta>;

export const オン: S = {};
export const オフ: S = { args: { initial: false } };
export const 保存先のヒント付き: S = {
  args: { label: "同じノートへのリアクション・リポストをまとめる", hint: true },
};
export const 名前が長い: S = {
  args: {
    label:
      "とても長い設定の名前で一行に収まらないときに切れて見えるかを確かめる",
  },
};
