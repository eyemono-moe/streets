import { createSignal } from "solid-js";
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

const RealtimeExample = () => {
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
        <VirtualList items={liveItems()} itemKey={(item) => item.id}>
          {(item) => <p class="border-primary border-b p-3">{item.text}</p>}
        </VirtualList>
      </div>
    </div>
  );
};

export const リアルタイム追加: Story = {
  render: () => <RealtimeExample />,
  decorators: [],
};
