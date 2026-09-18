import { createSignal, onCleanup } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import ProgressRing, { type RingCounts } from "./ProgressRing";

type Args = { counts?: RingCounts };

const Story = (props: Args) => (
  <div class="flex items-center gap-4 p-4">
    <ProgressRing counts={props.counts} />
    <span class="inline-flex scale-[3] p-4">
      <ProgressRing counts={props.counts} />
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
export const まだ結果が無い: S = {
  args: { counts: { done: 0, failed: 0, pending: 3 } },
};
export const 途中: S = { args: { counts: { done: 1, failed: 0, pending: 2 } } };
export const 一部失敗: S = {
  args: { counts: { done: 3, failed: 1, pending: 0 } },
};
export const 失敗だけ: S = {
  args: { counts: { done: 0, failed: 1, pending: 2 } },
};
export const 全部済んだ: S = {
  args: { counts: { done: 2, failed: 0, pending: 0 } },
};

/** 相手が多くても、区画は済んだ・失敗・待っているの 3 つまで。 */
export const たくさん: S = {
  args: { counts: { done: 7, failed: 2, pending: 11 } },
};

/** 1 本ずつ結果が届く様子。弧が伸びるのを見る。 */
export const 動き: S = {
  render: () => {
    const total = 6;
    const [settled, setSettled] = createSignal(0);
    const timer = setInterval(
      () => setSettled((n) => (n >= total + 2 ? 0 : n + 1)),
      700,
    );
    onCleanup(() => clearInterval(timer));
    const counts = () => {
      const n = Math.min(settled(), total);
      const failed = n >= 5 ? 1 : 0;
      return { done: n - failed, failed, pending: total - n };
    };
    return <Story counts={counts()} />;
  },
};
