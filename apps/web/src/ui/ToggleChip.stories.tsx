import { createSignal } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import ToggleChip from "./ToggleChip";

type Args = { label: string; initial: boolean; disabled: boolean };

const Story = (props: Args) => {
  const [pressed, setPressed] = createSignal(props.initial);
  return (
    <div class="flex gap-2 p-4">
      <ToggleChip
        label={props.label}
        pressed={pressed()}
        onChange={setPressed}
        disabled={props.disabled}
        disabledReason="書き込み先が 1 つも無くなるので外せません"
      />
    </div>
  );
};

const meta = {
  title: "UI/ToggleChip",
  component: Story,
  args: { label: "読み込み", initial: true, disabled: false },
} satisfies Meta<Args>;

export default meta;
type S = StoryObj<typeof meta>;

export const 入り: S = {};
export const 切り: S = { args: { initial: false } };
export const 押せない: S = { args: { disabled: true } };
