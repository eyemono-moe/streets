import { createSignal } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import SegmentedControl from "./SegmentedControl";

type Props = {
  variant: "primary" | "secondary";
  block: boolean;
  options: { value: string; label: string }[];
};

const Story = (props: Props) => {
  const [value, setValue] = createSignal(props.options[0]?.value ?? "");
  return (
    <div class="p-4">
      <SegmentedControl
        label="見本"
        options={props.options}
        value={value()}
        onChange={setValue}
        variant={props.variant}
        block={props.block}
      />
    </div>
  );
};

const meta = {
  title: "UI/SegmentedControl",
  component: Story,
  args: {
    variant: "primary",
    block: false,
    options: [
      { value: "comfortable", label: "ゆったり" },
      { value: "compact", label: "高密度" },
    ],
  },
  argTypes: {
    variant: { control: "inline-radio", options: ["primary", "secondary"] },
  },
} satisfies Meta<Props>;

export default meta;
type S = StoryObj<typeof meta>;

export const 主要: S = {};

export const 控えめ: S = {
  args: {
    variant: "secondary",
    options: [
      { value: "private", label: "非公開" },
      { value: "public", label: "公開" },
    ],
  },
};

export const 横幅いっぱい: S = {
  args: {
    block: true,
    options: [
      { value: "s", label: "S 320" },
      { value: "m", label: "M 380" },
      { value: "l", label: "L 440" },
    ],
  },
};

export const 項目が多い: S = {
  args: {
    block: true,
    options: [
      { value: "system", label: "OS に合わせる" },
      { value: "light", label: "ライト" },
      { value: "dark", label: "ダーク" },
      { value: "extra", label: "とても長い選択肢の名前" },
    ],
  },
};
