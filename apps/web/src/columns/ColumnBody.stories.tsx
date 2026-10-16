import { For } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import ColumnBody from "./ColumnBody";

const ColumnBodyStory = () => (
  <div class="flex h-[400px] w-[360px] flex-col border-primary border-x bg-primary">
    <ColumnBody columnId="story" scrollerRef={() => {}}>
      <For each={Array.from({ length: 30 }, (_, index) => index + 1)}>
        {(index) => (
          <p class="border-primary border-b px-3 py-4 text-body">
            {index} 件目の行。↑↓ や PageUp / PageDown で送れる。
          </p>
        )}
      </For>
    </ColumnBody>
  </div>
);

const meta = {
  title: "カラム/本文の枠",
  component: ColumnBodyStory,
} satisfies Meta<typeof ColumnBodyStory>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ふつう: Story = {};

/** Tab で入ったとき・スレッドを Esc で閉じて戻ったとき。キーで送る先のカラムに線が出る。 */
export const キーで送る先: Story = {
  play: ({ canvasElement }) => {
    canvasElement
      .querySelector<HTMLElement>("[data-scroll-container]")
      ?.focus({ focusVisible: true });
  },
};
