import type { Meta, StoryObj } from "storybook-solidjs-vite";
import ExperimentalBadge from "./ExperimentalBadge";
import Switch from "./Switch";

const Story = () => (
  <div class="flex w-80 flex-col gap-3 bg-secondary p-4">
    <div>
      <ExperimentalBadge />
    </div>
    <Switch
      label="botを除く"
      checked={false}
      onChange={() => {}}
      aside={<ExperimentalBadge />}
    />
    <Switch
      label="名前が長くて折り返すときも、印は 1 行目の横に残る項目の名前"
      checked
      onChange={() => {}}
      aside={<ExperimentalBadge />}
    />
  </div>
);

const meta = {
  title: "UI/ExperimentalBadge",
  component: Story,
} satisfies Meta;

export default meta;
type S = StoryObj<typeof meta>;

export const 単体とスイッチの横: S = {};
