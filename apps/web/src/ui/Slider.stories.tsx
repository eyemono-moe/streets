import { createSignal } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import Slider from "./Slider";

type Args = {
  label: string;
  initial: number;
  width: number;
  disabled: boolean;
};

const format = (value: number) => {
  const percent = Math.round((value - 1) * 100);
  if (percent === 0) return "標準";
  return `${percent > 0 ? "+" : "-"}${Math.abs(percent)}%`;
};

const Story = (props: Args) => {
  const [value, setValue] = createSignal(props.initial);
  const [ended, setEnded] = createSignal(props.initial);
  return (
    <div class="bg-primary p-4" style={{ width: `${props.width}px` }}>
      <Slider
        label={props.label}
        value={value()}
        min={0.8}
        max={1.2}
        step={0.05}
        format={format}
        onChange={setValue}
        onChangeEnd={setEnded}
        disabled={props.disabled}
      />
      <p class="mt-3 c-secondary text-caption">離したときの値: {ended()}</p>
    </div>
  );
};

const meta = {
  title: "UI/Slider",
  component: Story,
  args: { label: "コントラスト", initial: 1, width: 400, disabled: false },
} satisfies Meta<Args>;

export default meta;
type S = StoryObj<typeof meta>;

export const 標準: S = {};
export const 高め: S = { args: { initial: 1.2 } };
export const 低め: S = { args: { initial: 0.8 } };
export const 狭い幅: S = {
  args: { width: 220, label: "文字と背景の明るさの差を、くっきり寄りにするか" },
};
export const 無効: S = { args: { disabled: true, initial: 1.1 } };
