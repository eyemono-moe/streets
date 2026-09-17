import {
  type ReactionInput,
  buildReaction,
} from "@streets/core/nostr/build/reaction";
import type { NostrEvent } from "@streets/core/nostr/event";
import type { Component } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { type EventScene, EventSceneProvider } from "../storybook/EventScene";
import avatarUrl from "../storybook/avatar-fixture.svg";
import emojiUrl from "../storybook/emoji-fixture.svg";
import { type StoryAuthor, createStoryAuthor } from "../storybook/story-events";
import ActionNotice from "./ActionNotice";
import type { EventSize } from "./Event";

const viewer = createStoryAuthor(55, {
  name: "me",
  displayName: "わたし",
  picture: avatarUrl,
});
const alice = createStoryAuthor(11, {
  name: "alice",
  displayName: "あいもの",
  picture: avatarUrl,
});
const short = createStoryAuthor(12, { name: "a", displayName: "あ" });
const longName = createStoryAuthor(13, {
  name: "very-long-handle-that-will-not-fit-in-one-column-at-all",
  displayName:
    "とても長い表示名を持っている人のためのユーザーで一行には到底収まらない",
});
const nameless = createStoryAuthor(14);
const crowd: StoryAuthor[] = Array.from({ length: 24 }, (_, index) =>
  createStoryAuthor(100 + index, {
    name: `user${index}`,
    displayName: `ひと${index + 1}`,
    picture: index % 3 === 0 ? avatarUrl : undefined,
  }),
);

const mine = viewer.note(
  "マルチカラムのクライアントは、1 列に入る情報量が体験を決める。余白は削るところと残すところを分ける。",
);
const missing = viewer.note("シーンに入れないノート");

const react = (author: StoryAuthor, input: ReactionInput, target = mine) =>
  author.event(buildReaction(target, input));

const profiles = [viewer, alice, short, longName, ...crowd].map((author) =>
  author.profile(),
);

type Props = { events: NostrEvent[]; size: EventSize; missingIds?: string[] };

const NoticeStory: Component<Props> = (props) => {
  const scene = (): EventScene => ({
    events: [...profiles, mine, ...props.events],
    viewer,
    missingIds: props.missingIds,
  });
  return (
    <EventSceneProvider scene={scene()}>
      {/* 幅はツールバーのビューポート（カラム 320〜640px）で変える。 */}
      <ActionNotice events={props.events} size={props.size} />
    </EventSceneProvider>
  );
};

const meta = {
  title: "イベント/通知のリアクション・リポスト",
  component: NoticeStory,
  args: { size: "normal", events: [] },
  argTypes: {
    size: { control: "inline-radio", options: ["normal", "compact"] },
    events: { control: false },
    missingIds: { control: false },
  },
} satisfies Meta<typeof NoticeStory>;

export default meta;
type Story = StoryObj<typeof meta>;

// 1 件ずつ（まとめない、またはまとめる相手がいない）

export const いいね: Story = {
  args: { events: [react(alice, { type: "like" })] },
};

export const 絵文字: Story = {
  args: { events: [react(alice, { type: "text", content: "🥰" })] },
};

export const カスタム絵文字: Story = {
  args: {
    events: [
      react(alice, { type: "emoji", shortcode: "party", url: emojiUrl }),
    ],
  },
};

export const 長い文字のリアクション: Story = {
  args: {
    events: [
      react(alice, {
        type: "text",
        content: "とても長いテキストのリアクションで一行に収まらないもの",
      }),
    ],
  },
};

export const リポスト: Story = {
  args: { events: [alice.repost(mine)] },
};

export const 名前が極端に長い: Story = {
  args: { events: [react(longName, { type: "text", content: "🎉" })] },
};

export const 名前が極端に短い: Story = {
  args: { events: [react(short, { type: "like" })] },
};

export const プロフィールが無い: Story = {
  args: { events: [react(nameless, { type: "text", content: "👀" })] },
};

export const 対象が見つからない: Story = {
  args: {
    events: [react(alice, { type: "like" }, missing)],
    missingIds: [missing.id],
  },
};

// まとめたもの

export const まとめ_2人: Story = {
  args: {
    events: [
      react(alice, { type: "like" }),
      react(short, { type: "text", content: "🥰" }),
    ],
  },
};

export const まとめ_24人: Story = {
  args: {
    events: crowd.map((author, index) =>
      react(author, {
        type: "text",
        content: ["🥰", "🎉", "👀"][index % 3] ?? "🥰",
      }),
    ),
  },
};

export const まとめ_絵文字がいろいろ: Story = {
  args: {
    events: [
      "🥰",
      "🎉",
      "👀",
      "🙏",
      "🔥",
      "😂",
      "💯",
      "🫡",
      "とても長いテキストのリアクション",
    ]
      .map((content, index) =>
        react(crowd[index] ?? alice, { type: "text", content }),
      )
      .concat([
        react(alice, { type: "emoji", shortcode: "party", url: emojiUrl }),
        react(short, { type: "like" }),
      ]),
  },
};

export const まとめ_先頭の名前が極端に長い: Story = {
  args: {
    events: [
      react(longName, { type: "like" }),
      ...crowd.slice(0, 8).map((author) => react(author, { type: "like" })),
    ],
  },
};

export const まとめ_同じ人が2回: Story = {
  args: {
    events: [
      react(alice, { type: "text", content: "🥰" }),
      react(alice, { type: "like" }),
      react(short, { type: "like" }),
    ],
  },
};

export const まとめ_リポスト: Story = {
  args: {
    events: crowd.slice(0, 12).map((author) => author.repost(mine)),
  },
};
