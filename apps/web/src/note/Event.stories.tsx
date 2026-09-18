import { addBookmark } from "@streets/core/nostr/build/bookmark";
import {
  type ReactionInput,
  buildReaction,
} from "@streets/core/nostr/build/reaction";
import type { NostrEvent } from "@streets/core/nostr/event";
import { encodeBech32 } from "@streets/core/nostr/nip19";
import type { Component } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { type EventScene, EventSceneProvider } from "../storybook/EventScene";
import avatarUrl from "../storybook/avatar-fixture.svg";
import emojiUrl from "../storybook/emoji-fixture.svg";
import { type StoryAuthor, createStoryAuthor } from "../storybook/story-events";
import Event, { type EventSize } from "./Event";

const alice = createStoryAuthor(11, {
  name: "alice",
  displayName: "あいもの",
  picture: avatarUrl,
});
const bob = createStoryAuthor(22, { name: "bob", displayName: "ほかのひと" });
const carol = createStoryAuthor(33, { name: "carol" });
const nameless = createStoryAuthor(44);
const viewer = createStoryAuthor(55, { name: "me", displayName: "わたし" });
const profiles = [
  alice.profile(),
  bob.profile(),
  carol.profile(),
  viewer.profile(),
];

const plain = alice.note(
  "マルチカラムのクライアントは、1 列に入る情報量が体験を決める。余白は削るところと残すところを分ける。",
);
const tokens = bob.note(
  `リンク https://example.com/ 、ハッシュタグ #nostr 、メンション nostr:${encodeBech32("npub", alice.pubkey)} 、カスタム絵文字 :party: を含む本文。`,
  [
    ["t", "nostr"],
    ["emoji", "party", emojiUrl],
  ],
);
const reply = alice.reply(plain, "返信の本文。");
const quoted = bob.note("引用されたノートの本文。");
const quote = alice.quote(quoted, "引用つきのノート。");
const quoteOfQuote = carol.quote(
  quote,
  "引用の引用。中の引用は取りにいかない。",
);
const repost = carol.repost(plain);
const react = (author: StoryAuthor, input: ReactionInput) =>
  author.event(buildReaction(plain, input));
const engaged = [
  bob.reply(plain, "わかる"),
  carol.reply(plain, "たしかに"),
  react(bob, { type: "like" }),
  react(carol, { type: "like" }),
  react(alice, { type: "text", content: "🥰" }),
  react(bob, { type: "text", content: "🥰" }),
  react(carol, { type: "text", content: "🎉" }),
  react(bob, { type: "emoji", shortcode: "party", url: emojiUrl }),
  react(carol, { type: "text", content: "とても長いテキストのリアクション" }),
  react(alice, { type: "emoji", shortcode: "broken", url: "/missing.png" }),
];
const viewerEngaged = [
  react(viewer, { type: "like" }),
  react(viewer, { type: "text", content: "🥰" }),
  viewer.repost(plain),
  viewer.event(addBookmark({ type: "note", value: plain.id })(undefined)),
];
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
const unknown = alice.event({ kind: 30023, tags: [], content: "# 長文記事" });
const noProfile = nameless.note("kind:0 が無い人の投稿。");

const missingTarget = bob.note("このイベントはシーンに入れない");
const repostOfMissing = carol.repost(missingTarget);
const loadingTarget = bob.note("このイベントもシーンに入れない");
const repostOfLoading = carol.repost(loadingTarget);
const reactionToMissing = bob.event(
  buildReaction(missingTarget, { type: "like" }),
);

type Props = { event: NostrEvent; scene: EventScene; size: EventSize };

const EventStory: Component<Props> = (props) => (
  <EventSceneProvider scene={props.scene}>
    <Event event={props.event} size={props.size} />
  </EventSceneProvider>
);

const scene = (...events: NostrEvent[]): EventScene => ({
  events: [...profiles, ...events],
  viewer,
});

const meta = {
  title: "イベント/Event",
  component: EventStory,
  args: { size: "normal" },
  argTypes: {
    size: { control: "inline-radio", options: ["normal", "compact"] },
    event: { control: false },
    scene: { control: false },
  },
} satisfies Meta<typeof EventStory>;

export default meta;
type Story = StoryObj<typeof meta>;

export const 通常: Story = { args: { event: plain, scene: scene(plain) } };

export const 反応の件数: Story = {
  args: { event: plain, scene: scene(plain, ...engaged) },
};

export const 自分が反応済み: Story = {
  args: { event: plain, scene: scene(plain, ...engaged, ...viewerEngaged) },
};

export const 書き込みに失敗する: Story = {
  args: { event: plain, scene: { ...scene(plain), failWrites: true } },
};

export const ログインしていない: Story = {
  args: { event: plain, scene: { events: [...profiles, plain] } },
};

export const 本文のトークン: Story = {
  args: { event: tokens, scene: scene(tokens) },
};

export const 返信: Story = { args: { event: reply, scene: scene(reply) } };

export const 引用: Story = {
  args: { event: quote, scene: scene(quote, quoted) },
};

export const 引用の引用: Story = {
  args: {
    event: quoteOfQuote,
    scene: scene(quoteOfQuote, quote, quoted),
  },
};

export const 引用元が見つからない: Story = {
  args: {
    event: quote,
    scene: { ...scene(quote), missingIds: [quoted.id] },
  },
};

export const リポスト: Story = {
  args: { event: repost, scene: scene(repost, plain) },
};

export const リポスト元を読み込み中: Story = {
  args: { event: repostOfLoading, scene: scene(repostOfLoading) },
};

export const リポスト元が見つからない: Story = {
  args: {
    event: repostOfMissing,
    scene: { ...scene(repostOfMissing), missingIds: [missingTarget.id] },
  },
};

// 通知カラムに流れるリアクション。元のノートは自分のものなので、アクション列を出さない。
export const リアクション_いいね: Story = {
  args: { event: likeReaction, scene: scene(likeReaction, plain) },
};

export const リアクション_絵文字: Story = {
  args: { event: textReaction, scene: scene(textReaction, plain) },
};

export const リアクション_カスタム絵文字: Story = {
  args: { event: emojiReaction, scene: scene(emojiReaction, plain) },
};

export const リアクション_長い文字: Story = {
  args: { event: longReaction, scene: scene(longReaction, plain) },
};

export const リアクションの対象が見つからない: Story = {
  args: {
    event: reactionToMissing,
    scene: { ...scene(reactionToMissing), missingIds: [missingTarget.id] },
  },
};

export const 未対応のkind: Story = {
  args: { event: unknown, scene: scene(unknown) },
};

export const プロフィールが無い: Story = {
  args: { event: noProfile, scene: scene(noProfile) },
};

/**
 * 形の崩れたイベント（リレーから来るものは形を保証されない）。描画の途中で投げても、
 * この 1 件だけを「表示できませんでした」に置き換え、周りは描き続ける。
 */
export const 描けないイベント: Story = {
  args: {
    event: { ...unknown, kind: 1, tags: null } as unknown as NostrEvent,
    scene: scene(),
  },
};
