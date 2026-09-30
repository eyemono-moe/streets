import type { Meta, StoryObj } from "storybook-solidjs-vite";
import PollView from "./PollView";

const poll = {
  id: "a".repeat(64),
  question: "今日のお昼、何にする？",
  options: [
    { id: "opt0", label: "ラーメン" },
    { id: "opt1", label: "カレー" },
  ],
  multiple: false,
  endsAt: undefined,
  relays: [],
};

const meta = {
  title: "投票/投票の中身",
  component: PollView,
  args: {
    poll,
    nowSeconds: 0,
    size: "normal",
    canVote: true,
    sending: false,
    onVote: () => {},
  },
  decorators: [
    (Story) => (
      <div class="w-[344px]">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof PollView>;

export default meta;
type Story = StoryObj<typeof meta>;

/** 回答を取り終える前。票数の代わりに「集計中…」を出す。 */
export const 集計中: Story = { args: { tally: undefined } };

export const 送っている途中: Story = {
  args: {
    tally: { counts: { opt0: 0, opt1: 0 }, voters: 0, mine: undefined },
    sending: true,
  },
};
