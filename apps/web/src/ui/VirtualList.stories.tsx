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
