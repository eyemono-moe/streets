import { Show, createSignal } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import VirtualList from "./VirtualList";

const items = Array.from({ length: 200 }, (_, index) => ({
  id: `${index}`,
  text:
    index % 7 === 0
      ? `高さが変わる長い行 ${index}。`.repeat(12)
      : `通常の行 ${index}`,
}));

const meta = {
  title: "UI/VirtualList",
  component: VirtualList,
  args: {
    items,
    itemKey: (item) => item.id,
    children: (item) => <p class="border-primary border-b p-3">{item.text}</p>,
  },
  decorators: [
    (Story) => (
      <div
        data-scroll-container
        class="h-96 w-88 overflow-y-auto border border-primary"
      >
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof VirtualList<(typeof items)[number]>>;

export default meta;
type Story = StoryObj<typeof meta>;

export const 高さが異なる200件: Story = {};

/** 行が持っている状態（開いたメニューなど）が、新着で消えないことを見るための行。 */
const StatefulRow = (props: { text: string }) => {
  const [open, setOpen] = createSignal(false);
  return (
    <div class="border-primary border-b p-3">
      <button
        type="button"
        class="cursor-pointer bg-transparent underline"
        onClick={() => setOpen(!open())}
      >
        {props.text}
      </button>
      <Show when={open()}>
        <p class="mt-2 rounded-2 bg-secondary p-2 text-caption">
          開いたまま。先頭に行が増えても閉じない。
        </p>
      </Show>
    </div>
  );
};

const RealtimeExample = (props: { profile?: boolean; stateful?: boolean }) => {
  const [liveItems, setLiveItems] = createSignal(items.slice(0, 30));
  let next = 30;
  return (
    <div class="flex h-96 w-88 flex-col border border-primary">
      <button
        type="button"
        class="shrink-0 cursor-pointer border-primary border-b bg-secondary p-2"
        onClick={() => {
          const index = next++;
          setLiveItems((current) => [
            {
              id: `new-${index}`,
              text:
                index % 2 === 0
                  ? `リアルタイムに追加された長い行 ${index}。`.repeat(8)
                  : `リアルタイムに追加された行 ${index}`,
            },
            ...current,
          ]);
        }}
      >
        先頭に投稿を追加
      </button>
      <div data-scroll-container class="min-h-0 flex-1 overflow-y-auto">
        <Show when={props.profile}>
          <div class="flex h-36 flex-col justify-end gap-1 bg-secondary p-4">
            <strong>プロフィール</strong>
            <span class="c-secondary text-caption">
              一覧より前にある内容も見えたまま追従する
            </span>
          </div>
        </Show>
        <VirtualList items={liveItems()} itemKey={(item) => item.id}>
          {(item) => (
            <Show
              when={props.stateful}
              fallback={<p class="border-primary border-b p-3">{item.text}</p>}
            >
              <StatefulRow text={item.text} />
            </Show>
          )}
        </VirtualList>
      </div>
    </div>
  );
};

export const リアルタイム追加: Story = {
  render: () => <RealtimeExample profile={false} />,
  decorators: [],
};

export const プロフィールの下でリアルタイム追加: Story = {
  render: () => <RealtimeExample profile />,
  decorators: [],
};

/**
 * どれかの行を押して開いてから「先頭に投稿を追加」を押す。行は中身ごとに
 * 持っているので、順番がずれても開いたまま（メニューやダイアログが消えない）。
 */
export const 開いた行は新着で閉じない: Story = {
  render: () => <RealtimeExample stateful />,
  decorators: [],
};
