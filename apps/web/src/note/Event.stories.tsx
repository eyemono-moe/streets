import type { NostrEvent } from "@streets/core/nostr/event";
import { encodeBech32 } from "@streets/core/nostr/nip19";
import type { Component } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { type EventScene, EventSceneProvider } from "../storybook/EventScene";
import avatarUrl from "../storybook/avatar-fixture.svg";
import emojiUrl from "../storybook/emoji-fixture.svg";
import { createStoryAuthor } from "../storybook/story-events";
import Event, { type EventSize } from "./Event";

const alice = createStoryAuthor(11, {
  name: "alice",
  displayName: "あいもの",
  picture: avatarUrl,
});
const bob = createStoryAuthor(22, { name: "bob", displayName: "ほかのひと" });
const carol = createStoryAuthor(33, { name: "carol" });
const nameless = createStoryAuthor(44);
const profiles = [alice.profile(), bob.profile(), carol.profile()];

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
const unknown = alice.event({ kind: 30023, tags: [], content: "# 長文記事" });
const noProfile = nameless.note("kind:0 が無い人の投稿。");

const missingTarget = bob.note("このイベントはシーンに入れない");
const repostOfMissing = carol.repost(missingTarget);
const loadingTarget = bob.note("このイベントもシーンに入れない");
const repostOfLoading = carol.repost(loadingTarget);

type Props = { event: NostrEvent; scene: EventScene; size: EventSize };

const EventStory: Component<Props> = (props) => (
  <EventSceneProvider scene={props.scene}>
    <Event event={props.event} size={props.size} />
  </EventSceneProvider>
);

const scene = (...events: NostrEvent[]): EventScene => ({
  events: [...profiles, ...events],
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

export const 未対応のkind: Story = {
  args: { event: unknown, scene: scene(unknown) },
};

export const プロフィールが無い: Story = {
  args: { event: noProfile, scene: scene(noProfile) },
};
