import type { Meta, StoryObj } from "storybook-solidjs-vite";
import ProgressRing, { type RingSegment } from "./ProgressRing";

type Args = { segments?: RingSegment[] };

const Story = (props: Args) => (
  <div class="flex items-center gap-3 p-4">
    <ProgressRing segments={props.segments} />
    <span class="scale-[2]">
      <ProgressRing segments={props.segments} />
    </span>
  </div>
);

const meta = {
  title: "UI/ProgressRing",
  component: Story,
  args: {},
} satisfies Meta<Args>;

export default meta;
type S = StoryObj<typeof meta>;

export const 送り先が決まる前: S = {};
export const 待っている: S = {
  args: { segments: ["pending", "pending", "pending"] },
};
export const 途中: S = { args: { segments: ["done", "pending", "pending"] } };
export const 一部失敗: S = {
  args: { segments: ["done", "failed", "done", "done"] },
};
export const 全部済んだ: S = { args: { segments: ["done", "done"] } };
export const 一つだけ: S = { args: { segments: ["done"] } };
export const たくさん: S = {
  args: {
    segments: Array.from({ length: 12 }, (_, i) =>
      i % 5 === 0 ? "failed" : i % 3 === 0 ? "pending" : "done",
    ),
  },
};
