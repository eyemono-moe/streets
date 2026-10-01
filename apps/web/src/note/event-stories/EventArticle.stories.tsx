import type { Meta, StoryObj } from "storybook-solidjs-vite";
import {
  bareArticle,
  fullArticle,
  longTitleArticle,
} from "../../article/story-articles";
import { EventStory, bob, eventStoryMeta, scene } from "./event-story";

const quote = bob.quote(fullArticle, "この記事おすすめ。");

const meta = {
  ...eventStoryMeta,
  title: "イベント/長文記事",
} satisfies Meta<typeof EventStory>;

export default meta;
type Story = StoryObj<typeof meta>;

/** 押すと、記事を読むカラムを開く。 */
export const 記事: Story = {
  args: { event: fullArticle, scene: scene(fullArticle) },
};

/** 要約が無い記事は、本文の頭を要約の代わりに出す。 */
export const 題名も要約も画像も無い: Story = {
  args: { event: bareArticle, scene: scene(bareArticle) },
};

export const 長い題名と読めない画像: Story = {
  args: { event: longTitleArticle, scene: scene(longTitleArticle) },
};

export const コンパクト: Story = {
  args: { event: fullArticle, scene: scene(fullArticle), size: "compact" },
};

export const 引用された記事: Story = {
  args: { event: quote, scene: scene(quote, fullArticle) },
};
