import type { Meta, StoryObj } from "storybook-solidjs-vite";
import TimeCircuits from "./TimeCircuits";

const at = (...args: [number, number, number, number, number]) =>
  Math.floor(new Date(...args).getTime() / 1000);

const meta = {
  title: "カラム/タイムサーキット",
  component: TimeCircuits,
  render: (props) => (
    <div class="w-80 bg-primary p-4">
      <TimeCircuits {...props} />
    </div>
  ),
  args: {
    destination: at(2026, 9, 1, 12, 34),
    departed: at(2026, 8, 28, 8, 15),
  },
} satisfies Meta<typeof TimeCircuits>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ふつう: Story = {};

/** 前に出発した時刻を持たない（この表示より前に足したカラム）。欄は消えたまま。 */
export const 出発した時刻が無い: Story = { args: { departed: undefined } };

/** 午前 0 時台は 12 時・AM と出す。 */
export const 真夜中: Story = {
  args: {
    destination: at(1985, 9, 26, 0, 21),
    departed: at(1955, 10, 5, 6, 15),
  },
};

export const 狭いカラム: Story = {
  render: (props) => (
    <div class="w-70 bg-primary p-2">
      <TimeCircuits {...props} />
    </div>
  ),
};
