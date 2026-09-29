import type { Meta, StoryObj } from "storybook-solidjs-vite";
import avatarUrl from "../../storybook/avatar-fixture.svg";
import { createStoryAuthor } from "../../storybook/story-events";
import { EventStory, eventStoryMeta, scene } from "./event-story";

const profileEvent = createStoryAuthor(66, {
  name: "dave",
  displayName: "でいぶ",
  picture: avatarUrl,
  about: "カラムで Nostr を読んでいます。\n写真と散歩の話が多めです。",
}).profile();
const longNameProfile = createStoryAuthor(77, {
  name: "a_very_long_account_name_that_does_not_fit_in_a_column",
  displayName: "とても長い表示名でカラムの幅には収まりきらない人の名前",
  picture: avatarUrl,
  about: Array.from(
    { length: 6 },
    () => "自己紹介が長いときは 3 行で切ります。",
  ).join(""),
}).profile();
const noAboutProfile = createStoryAuthor(88, {
  name: "erin",
  picture: avatarUrl,
}).profile();
const noPictureProfile = createStoryAuthor(99, {
  name: "frank",
  displayName: "ふらんく",
  about: "アイコンを設定していない人。",
}).profile();

const meta = {
  ...eventStoryMeta,
  title: "イベント/プロフィール",
} satisfies Meta<typeof EventStory>;

export default meta;
type Story = StoryObj<typeof meta>;

/** 検索などで kind:0 が届いたとき。フォロー一覧と同じユーザーの行で描く。 */
export const プロフィール: Story = {
  args: { event: profileEvent, scene: scene(profileEvent) },
};

export const 名前が長い: Story = {
  args: { event: longNameProfile, scene: scene(longNameProfile) },
};

export const 自己紹介が無い: Story = {
  args: { event: noAboutProfile, scene: scene(noAboutProfile) },
};

export const 画像が無い: Story = {
  args: { event: noPictureProfile, scene: scene(noPictureProfile) },
};
