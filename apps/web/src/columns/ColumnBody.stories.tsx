import { Show, createSignal, onMount } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import VirtualList from "../ui/VirtualList";
import ColumnBody from "./ColumnBody";

const rows = Array.from({ length: 60 }, (_, index) => ({
  id: `${index + 1}`,
  text:
    index % 5 === 0
      ? `${index + 1} 件目の長い行。`.repeat(8)
      : `${index + 1} 件目の行`,
}));

const ColumnBodyStory = () => {
  // 一覧は枠を置いてから描く。枠と同時に作ると、一覧がスクロール領域を測れず
  // 行が 1 つも出ない（アプリでは投稿が届いてから描くので起きない）。
  const [ready, setReady] = createSignal(false);
  onMount(() => setReady(true));
  return (
    <div class="flex h-[400px] w-[360px] flex-col border-primary border-x bg-primary">
      <ColumnBody columnId="story" scrollerRef={() => {}}>
        <Show when={ready()}>
          <VirtualList items={rows} itemKey={(row) => row.id} estimateSize={60}>
            {(row) => (
              <div class="flex flex-col gap-2 border-primary border-b bg-primary px-3 py-3 text-body">
                <p>{row.text}</p>
                <button type="button" class="self-start text-caption underline">
                  リアクション
                </button>
              </div>
            )}
          </VirtualList>
        </Show>
      </ColumnBody>
    </div>
  );
};

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

/**
 * 読み進めてから Tab を押したとき。DOM の先頭（画面より上に先読みした行）ではなく、
 * 上端が見えている最初の行に入る。もう一度 Tab で、その行のボタンへ進む。
 */
export const Tabで見えている行に入る: Story = {
  play: async ({ canvasElement }) => {
    const scroller = canvasElement.querySelector<HTMLElement>(
      "[data-scroll-container]",
    );
    if (!scroller) return;
    scroller.scrollTop = 900;
    await new Promise((resolve) => requestAnimationFrame(resolve));
    scroller.focus();
    scroller.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Tab", bubbles: true }),
    );
  },
};
