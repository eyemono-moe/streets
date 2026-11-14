import type { Component } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { EventSceneProvider } from "../storybook/EventScene";
import { createStoryAuthor } from "../storybook/story-events";
import WriteSheet, { type WriteSheetProps } from "./WriteSheet";

const alice = createStoryAuthor(560, { name: "宛先の人" });
const bob = createStoryAuthor(561, { name: "名指しされた人" });

type Props = Omit<WriteSheetProps, "onApprove" | "onCancel"> & {
  /** カラムの幅（px）。 */
  width: number;
};

const SheetStory: Component<Props> = (props) => (
  <EventSceneProvider scene={{ events: [alice.profile(), bob.profile()] }}>
    <div
      class="relative h-[560px] overflow-hidden border border-primary bg-primary"
      style={{ width: `${props.width}px` }}
    >
      <p class="c-secondary p-4 text-caption">
        アップレットの画面（ここが iframe になる）
      </p>
      <WriteSheet {...props} onApprove={() => {}} onCancel={() => {}} />
    </div>
  </EventSceneProvider>
);

const meta = {
  title: "カラム/アップレットからの書き込み",
  component: SheetStory,
  args: {
    source: "Chronofeed",
    kind: 1,
    kindLabel: "短いテキスト投稿",
    content: "アップレットから投稿してみる",
    mentions: [],
    tagCount: 0,
    overwrites: false,
    rememberable: true,
    width: 360,
  },
} satisfies Meta<typeof SheetStory>;

export default meta;
type Story = StoryObj<typeof meta>;

export const 投稿: Story = {};

export const 名指しとタグがある: Story = {
  args: {
    mentions: [bob.pubkey, alice.pubkey, "c".repeat(64), "d".repeat(64)],
    tagCount: 6,
  },
};

/** 置き換えるもの（フォローリストなど）は、毎回確かめる。 */
export const 置き換える: Story = {
  args: {
    kind: 3,
    kindLabel: "フォローリスト",
    content: "",
    tagCount: 120,
    overwrites: true,
    rememberable: false,
  },
};

/** 空のフォローリスト。書くと全員のフォローが外れる。 */
export const 空で置き換える: Story = {
  args: {
    kind: 3,
    kindLabel: "フォローリスト",
    content: "",
    tagCount: 0,
    overwrites: true,
    rememberable: false,
  },
};

export const 消す: Story = {
  args: {
    kind: 5,
    kindLabel: "削除の依頼",
    content: "",
    tagCount: 1,
    overwrites: true,
    rememberable: false,
  },
};

export const 暗号化して送る: Story = {
  args: {
    kind: 30078,
    kindLabel: "アプリの設定",
    content: '{"theme":"dark"}',
    recipient: alice.pubkey,
  },
};

export const 知らない種類で本文が長い: Story = {
  args: {
    kind: 9999,
    kindLabel: "kind:9999 のイベント",
    content: "とても長い本文。".repeat(80),
  },
};

export const 狭いカラム: Story = { args: { width: 240 } };
