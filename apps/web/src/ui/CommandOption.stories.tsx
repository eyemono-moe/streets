import type { Meta, StoryObj } from "storybook-solidjs-vite";
import CommandOption from "./CommandOption";

const Demo = (props: {
  title: string;
  category: string;
  selected: boolean;
  width: string;
}) => (
  <div class="p-4" style={{ width: props.width }} role="listbox">
    <CommandOption
      id="example-option"
      title={props.title}
      category={props.category}
      icon="i-material-symbols:settings-outline-rounded"
      selected={props.selected}
      onSelect={() => undefined}
      onHover={() => undefined}
    />
  </div>
);

const meta = {
  title: "UI/CommandOption",
  component: Demo,
  args: {
    title: "カラムの幅",
    category: "設定",
    selected: false,
    width: "440px",
  },
} satisfies Meta<typeof Demo>;

export default meta;
type S = StoryObj<typeof meta>;

export const 通常: S = {};
export const 選択中: S = { args: { selected: true } };
export const 長い項目名_狭い幅: S = {
  args: {
    title: "Zap の受け取り先（ライトニングアドレス）",
    width: "240px",
  },
};
