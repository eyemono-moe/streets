import { createSignal } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import SearchInput from "./SearchInput";

const Demo = (props: {
  initial: string;
  clearable?: boolean;
  placeholder?: string;
  width?: string;
}) => {
  const [value, setValue] = createSignal(props.initial);
  return (
    <div class="p-4" style={{ width: props.width ?? "360px" }}>
      <SearchInput
        class="w-full"
        label="探す"
        placeholder={props.placeholder ?? "名前で絞り込む"}
        value={value()}
        onValueChange={setValue}
        clearable={props.clearable}
      />
    </div>
  );
};

const meta = {
  title: "UI/SearchInput",
  component: Demo,
  args: { initial: "", clearable: true },
} satisfies Meta<typeof Demo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const 空: Story = {};
/** 入っている間だけ × を出す。押すか Escape で空に戻る。 */
export const 入力あり: Story = { args: { initial: "ねこ" } };
export const 消せない: Story = { args: { initial: "ねこ", clearable: false } };
export const 長い入力: Story = {
  args: {
    initial:
      "とても長い検索語を入れたときに、消すボタンと重ならずに、入力が末尾で切れるかを確かめる",
  },
};
export const 狭い幅: Story = {
  args: {
    initial: "ねこ",
    width: "200px",
    placeholder: "絵文字を探す（ねこ / cat）",
  },
};
