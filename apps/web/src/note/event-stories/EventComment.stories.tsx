import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { fullArticle } from "../../article/story-articles";
import {
  EventStory,
  bob,
  carol,
  eventStoryMeta,
  plain,
  scene,
} from "./event-story";

/** 外部の識別子（NIP-73）へのコメント。 */
const externalComment = (value: string, kind: string, content: string) =>
  carol.event({
    kind: 1111,
    tags: [
      ["I", value],
      ["K", kind],
      ["i", value],
      ["k", kind],
    ],
    content,
  });

const toNote = bob.comment(plain, "kind:1 への返信を、コメントで書いたもの。");
const toComment = carol.comment(toNote, "コメントへの返信。", plain);
const toArticle = bob.comment(fullArticle, "記事へのコメント。");
const toArticleComment = carol.comment(
  toArticle,
  "記事へのコメントへの返信。",
  fullArticle,
);
const toUnknown = carol.event({
  kind: 1111,
  tags: [
    ["E", "9".repeat(64), "", bob.pubkey],
    ["K", "34236"],
    ["e", "9".repeat(64), "", bob.pubkey],
    ["k", "34236"],
  ],
  content: "表示できない種類のものへのコメント。",
});
const toWeb = externalComment(
  "https://example.com/articles/2026/10/a-very-long-path-that-does-not-fit-in-a-narrow-column",
  "web",
  "Web ページへのコメント。",
);
const toHashtag = externalComment("#nostr", "#", "ハッシュタグへのコメント。");
const long = bob.comment(
  plain,
  Array.from(
    { length: 16 },
    (_, index) => `${index + 1} 行目。長いコメントは投稿と同じところで畳む。`,
  ).join("\n"),
);
const empty = bob.comment(plain, "");

const meta = {
  ...eventStoryMeta,
  title: "イベント/投稿/コメント",
} satisfies Meta<typeof EventStory>;

export default meta;
type Story = StoryObj<typeof meta>;

/** 投稿への返信をコメントで書いたもの。返信と同じに見せる。 */
export const 投稿への返信: Story = {
  args: { event: toNote, scene: scene(toNote, plain) },
};

export const 投稿への返信_返信先つき: Story = {
  args: { event: toNote, scene: scene(toNote, plain), replyContext: true },
};

/** 返信への返信になったコメント。根は大文字の E にだけある。 */
export const コメントへの返信_返信先つき: Story = {
  args: {
    event: toComment,
    scene: scene(toComment, toNote, plain),
    replyContext: true,
  },
};

/** 記事へのコメントは、何へのコメントかを上に書き、記事を住所で引いて添える。 */
export const 記事へのコメント_返信先つき: Story = {
  args: {
    event: toArticle,
    scene: scene(toArticle, fullArticle),
    replyContext: true,
  },
};

export const 記事へのコメントへの返信: Story = {
  args: {
    event: toArticleComment,
    scene: scene(toArticleComment, toArticle, fullArticle),
    replyContext: true,
  },
};

export const 知らない種類へのコメント: Story = {
  args: { event: toUnknown, scene: scene(toUnknown), replyContext: true },
};

export const Webページへのコメント: Story = {
  args: { event: toWeb, scene: scene(toWeb), replyContext: true },
};

export const ハッシュタグへのコメント: Story = {
  args: { event: toHashtag, scene: scene(toHashtag) },
};

export const 長い本文: Story = {
  args: { event: long, scene: scene(long, plain) },
};

export const 空の本文: Story = {
  args: { event: empty, scene: scene(empty, plain) },
};

export const 返信先を取得中: Story = {
  args: { event: toComment, scene: scene(toComment), replyContext: true },
};

export const 返信先が見つからない: Story = {
  args: {
    event: toComment,
    scene: { ...scene(toComment), missingIds: [toNote.id] },
    replyContext: true,
  },
};

export const 狭いカラム: Story = {
  args: {
    event: toArticle,
    scene: scene(toArticle, fullArticle),
    replyContext: true,
    width: 260,
  },
};

export const 狭いカラム_Webページ: Story = {
  args: { event: toWeb, scene: scene(toWeb), width: 260 },
};

export const コンパクト: Story = {
  args: { event: toArticle, scene: scene(toArticle), size: "compact" },
};
