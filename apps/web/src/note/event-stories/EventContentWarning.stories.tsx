import type { Meta, StoryObj } from "storybook-solidjs-vite";
import portraitUrl from "../../storybook/media-portrait.svg?no-inline";
import {
  EventStory,
  alice,
  bob,
  carol,
  eventStoryMeta,
  scene,
} from "./event-story";

const imageUrl = new URL(portraitUrl, location.href).href;
const warnedWithImage = alice.note(`ネタバレを含みます。\n${imageUrl}`, [
  ["content-warning", "映画のネタバレ"],
]);
const warnedWithoutReason = bob.note("理由の書かれていない閲覧注意。", [
  ["content-warning"],
]);
const warnedLongReason = carol.note("理由の長い閲覧注意。", [
  [
    "content-warning",
    "とても長い理由を書いた閲覧注意で、狭いカラムでも折り返して最後まで読めることを確かめるための文です",
  ],
]);
const warnedQuoted = bob.note("引用された側の閲覧注意の投稿。", [
  ["content-warning", "閲覧注意"],
]);
const quoteOfWarned = alice.quote(warnedQuoted, "閲覧注意の投稿を引用。");

const meta = {
  ...eventStoryMeta,
  title: "イベント/投稿/閲覧注意",
} satisfies Meta<typeof EventStory>;

export default meta;
type Story = StoryObj<typeof meta>;

// 閲覧注意（NIP-36）。「表示する」を押すと中身を出す。
export const 閲覧注意: Story = {
  args: { event: warnedWithImage, scene: scene(warnedWithImage) },
};
export const 理由なし: Story = {
  args: { event: warnedWithoutReason, scene: scene(warnedWithoutReason) },
};
export const 理由が長い: Story = {
  args: { event: warnedLongReason, scene: scene(warnedLongReason) },
};
export const 閲覧注意の投稿を引用: Story = {
  args: { event: quoteOfWarned, scene: scene(quoteOfWarned, warnedQuoted) },
};
export const 常に表示: Story = {
  args: {
    event: warnedWithImage,
    scene: scene(warnedWithImage),
    contentWarning: "show",
  },
};
