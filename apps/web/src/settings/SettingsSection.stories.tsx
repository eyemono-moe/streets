import { createSignal } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import SegmentedControl from "../ui/SegmentedControl";
import SettingsSection from "./SettingsSection";

type Layout = "auto" | "single" | "multi";
type Args = { value: Layout; width: number };

const OPTIONS: { value: Layout; label: string }[] = [
  { value: "auto", label: "画面幅に合わせる" },
  { value: "single", label: "1 列" },
  { value: "multi", label: "複数列" },
];

/** 既定（画面幅に合わせる）から変えると、名前の横に「既定に戻す」が出る。 */
const Story = (props: Args) => {
  const [value, setValue] = createSignal(props.value);
  return (
    <div class="bg-primary p-6" style={{ width: `${props.width}px` }}>
      <SettingsSection
        title="カラムの並べ方"
        scope="device"
        description="カラムを横に並べるか、1 列ずつ切り替えて見せるかを選びます。"
        changed={value() !== "auto"}
        onReset={() => setValue("auto")}
      >
        <SegmentedControl
          label="カラムの並べ方"
          options={OPTIONS}
          value={value()}
          onChange={setValue}
        />
      </SettingsSection>
    </div>
  );
};

/** 変えてある項目と既定のままの項目を並べる。「既定に戻す」の有無で、名前の行の高さが変わらないことを見る。 */
const Compare = (props: Args) => (
  <div class="flex flex-col gap-4">
    <Story value="auto" width={props.width} />
    <Story value="multi" width={props.width} />
  </div>
);

const meta = {
  title: "設定/設定の項目",
  component: Story,
  args: { value: "auto", width: 660 },
  argTypes: {
    value: { control: "inline-radio", options: ["auto", "single", "multi"] },
  },
} satisfies Meta<Args>;

export default meta;
type S = StoryObj<typeof meta>;

export const 既定のまま: S = {};
export const 変えてある: S = { args: { value: "multi" } };
export const 狭い幅: S = { args: { value: "multi", width: 340 } };

export const 有無で高さが同じ: S = {
  render: (args) => <Compare {...args} />,
};
