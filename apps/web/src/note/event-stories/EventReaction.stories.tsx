import { buildReaction } from "@streets/core/nostr/build/reaction";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import emojiUrl from "../../storybook/emoji-fixture.svg";
import {
  EventStory,
  bob,
  carol,
  eventStoryMeta,
  plain,
  react,
  scene,
} from "./event-story";

const likeReaction = react(bob, { type: "like" });
const textReaction = react(carol, { type: "text", content: "🥰" });
const emojiReaction = react(bob, {
  type: "emoji",
  shortcode: "party",
  url: emojiUrl,
});
const longReaction = react(carol, {
  type: "text",
  content: "とても長いテキストのリアクションで一行に収まらないもの",
});
const missingTarget = bob.note("このイベントはシーンに入れない");
const reactionToMissing = bob.event(
  buildReaction(missingTarget, { type: "like" }),
);

const meta = {
  ...eventStoryMeta,
  title: "イベント/リアクション",
} satisfies Meta<typeof EventStory>;

export default meta;
type Story = StoryObj<typeof meta>;

// 通知カラムに流れるリアクション。元のノートは自分のものなので、アクション列を出さない。
export const いいね: Story = {
  args: { event: likeReaction, scene: scene(likeReaction, plain) },
};

export const 絵文字: Story = {
  args: { event: textReaction, scene: scene(textReaction, plain) },
};

export const カスタム絵文字: Story = {
  args: { event: emojiReaction, scene: scene(emojiReaction, plain) },
};

export const 長い文字: Story = {
  args: { event: longReaction, scene: scene(longReaction, plain) },
};

export const 対象が見つからない: Story = {
  args: {
    event: reactionToMissing,
    scene: { ...scene(reactionToMissing), missingIds: [missingTarget.id] },
  },
};
