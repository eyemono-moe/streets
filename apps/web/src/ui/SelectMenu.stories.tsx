import { createSignal } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import SelectMenu from "./SelectMenu";

const options = [
  { value: "light", label: "ライト" },
  { value: "dark", label: "ダーク" },
  { value: "sepia", label: "セピア" },
  { value: "solarized", label: "Solarized" },
  { value: "high-contrast", label: "とても長い名前の、はっきりした配色" },
];

const Story = (props: { value?: string }) => {
  const [value, setValue] = createSignal(props.value);
  return (
    <div class="bg-primary p-4">
      <SelectMenu
        label="配色"
        value={value()}
        options={options}
        placeholder="決めない"
        onChange={setValue}
      />
    </div>
  );
};

const meta = {
  title: "UI/SelectMenu",
  component: Story,
  args: { value: "dark" },
} satisfies Meta<typeof Story>;

export default meta;
type S = StoryObj<typeof meta>;

export const ふつう: S = {};

export const 選んでいない: S = { args: { value: undefined } };

export const 長い名前: S = { args: { value: "high-contrast" } };
