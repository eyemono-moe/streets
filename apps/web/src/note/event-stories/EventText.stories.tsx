import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { createStoryAuthor } from "../../storybook/story-events";
import {
  EventStory,
  alice,
  bob,
  eventStoryMeta,
  plain,
  scene,
  tokens,
} from "./event-story";

const longUrls = alice.note(
  [
    "長いリンク https://example.com/articles/2026/09/streets-multi-column-client?utm_source=nostr&utm_medium=social#comments を含む本文。",
    "ホストが長いリンク https://a-very-long-subdomain.of-some-long-host.example.co.jp/path/to/the/page/index.html",
    "短いリンク https://example.com/short",
    "符号化された日本語 https://ja.wikipedia.org/wiki/%E3%83%9E%E3%83%AB%E3%83%81%E3%82%AB%E3%83%A9%E3%83%A0%E3%83%BB%E3%82%AF%E3%83%A9%E3%82%A4%E3%82%A2%E3%83%B3%E3%83%88",
    "符号化されていない日本語 https://dic.pixiv.net/a/ピクシブ百科辞典で始まる長い記事の名前 、見出し https://example.com/guide#はじめに 。",
  ].join("\n"),
);
const hashtagInNarrowColumn = bob.note(
  "今日の散歩 #東京 #とても長いハッシュタグを狭いカラムで表示する #Nostr",
);
const longBody = alice.note(
  Array.from(
    { length: 18 },
    (_, index) =>
      `${index + 1}. 長い投稿でもタイムライン全体を占有しないように、最初は本文を省略して表示します。リンク https://example.com/${index + 1} と絵文字 🏙️ を含む行です。`,
  ).join("\n"),
);
const quoteOfLongBody = bob.quote(longBody, "長い投稿を引用する。");
const noProfile = createStoryAuthor(44).note("kind:0 が無い人の投稿。");

const meta = {
  ...eventStoryMeta,
  title: "イベント/投稿/本文",
} satisfies Meta<typeof EventStory>;

export default meta;
type Story = StoryObj<typeof meta>;

export const 通常: Story = { args: { event: plain, scene: scene(plain) } };

export const 本文のトークン: Story = {
  args: { event: tokens, scene: scene(tokens) },
};

export const 長いURL: Story = {
  args: { event: longUrls, scene: scene(longUrls) },
};

export const 長いURL_狭いカラム: Story = {
  args: { event: longUrls, scene: scene(longUrls), size: "compact" },
};

export const 狭いカラムのハッシュタグ: Story = {
  args: {
    event: hashtagInNarrowColumn,
    scene: scene(hashtagInNarrowColumn),
    size: "compact",
  },
};

export const 長い本文: Story = {
  args: { event: longBody, scene: scene(longBody) },
};

export const 長い本文_コンパクト: Story = {
  args: { event: longBody, scene: scene(longBody), size: "compact" },
};

/** スレッドで開いた投稿。一覧で「続きを読む」を押した先なので、畳まず全文を出す。 */
export const 長い本文_スレッドで開いた投稿: Story = {
  args: { event: longBody, scene: scene(longBody), fullBody: true },
};

export const 長い本文の引用: Story = {
  args: { event: quoteOfLongBody, scene: scene(quoteOfLongBody, longBody) },
};

export const プロフィールが無い: Story = {
  args: { event: noProfile, scene: scene(noProfile) },
};
