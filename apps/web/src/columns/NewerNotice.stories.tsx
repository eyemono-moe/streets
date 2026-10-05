import type { Component } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import avatarUrl from "../storybook/avatar-fixture.svg";
import { EventSceneProvider } from "../storybook/EventScene";
import { createStoryAuthor } from "../storybook/story-events";
import NewerNotice from "./NewerNotice";

const authors = Array.from({ length: 5 }, (_, index) =>
  createStoryAuthor(300 + index, {
    name: `user${index}`,
    // 画像の無い人は、pubkey 固有の標識になる。
    picture: index % 2 === 0 ? avatarUrl : undefined,
  }),
);
const [first, second, third] = authors.map((author) => author.pubkey);

type Props = {
  count: number;
  noun: string;
  authors: string[];
  /** カラムの幅（px）。 */
  width: number;
};

const NoticeStory: Component<Props> = (props) => (
  <EventSceneProvider
    scene={{ events: authors.map((author) => author.profile()) }}
  >
    {/* カラムの見出しのすぐ下に浮かべたときと同じ置き方。 */}
    <div
      class="relative h-40 border border-primary bg-primary"
      style={{ width: `${props.width}px` }}
    >
      <div class="pointer-events-none absolute inset-x-0 top-2 flex justify-center px-3">
        <NewerNotice
          count={props.count}
          noun={props.noun}
          authors={props.authors}
          onClick={() => {}}
        />
      </div>
    </div>
  </EventSceneProvider>
);

const meta = {
  title: "カラム/新しい投稿の知らせ",
  component: NoticeStory,
  args: {
    count: 5,
    noun: "投稿",
    authors: authors.map((author) => author.pubkey),
    width: 360,
  },
  argTypes: { authors: { control: false } },
} satisfies Meta<typeof NoticeStory>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ふつう: Story = {};

export const 一人だけ: Story = {
  args: { count: 1, authors: [first ?? ""] },
};

/** 同じ人が続けて書いても、アイコンは 1 つ。 */
export const 同じ人が続く: Story = {
  args: {
    count: 4,
    authors: [first ?? "", first ?? "", second ?? "", first ?? ""],
  },
};

export const 多い件数: Story = {
  args: { count: 340 },
};

/** 書いた人が分からない行（読めない Zap など）だけのとき。 */
export const 人が分からない: Story = {
  args: { count: 2, authors: [] },
};

export const 通知: Story = {
  args: { count: 3, noun: "通知", authors: [third ?? "", second ?? ""] },
};

export const 狭いカラム: Story = {
  args: { count: 340, width: 280 },
};
