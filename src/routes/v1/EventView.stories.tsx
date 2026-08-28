import type { Component } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import type { NostrEvent } from "../../core/nostr/event";
import { encodeBech32 } from "../../core/nostr/nip19";
import {
  type EventScene,
  EventSceneProvider,
} from "../../storybook/EventScene";
import customEmojiFixtureUrl from "../../storybook/custom-emoji-fixture.svg";
import { createStoryAuthor } from "../../storybook/story-events";
import EventView from "./EventView";

type EventStoryProps = {
  event: NostrEvent;
  scene: EventScene;
  variant: "full" | "compact";
};

const EventStory: Component<EventStoryProps> = (props) => (
  <EventSceneProvider scene={props.scene}>
    <EventView id={props.event.id} variant={props.variant} />
  </EventSceneProvider>
);

const alice = createStoryAuthor(11, {
  name: "alice",
  displayName: "Alice / アリス",
  about: "Nostr と街歩きが好きです。",
});
const bob = createStoryAuthor(22, {
  name: "bob",
  displayName: "Bob",
  about: "リレーを作っています。",
});
const carol = createStoryAuthor(33, {
  name: "carol",
  displayName: "Carol",
});
const profiles = [alice.profile(), bob.profile(), carol.profile()];

const plainNote = alice.note(
  "Storybook ならリレーへ publish せず、同じイベントを何度でも確認できます。\n\n#nostr #streets",
  {
    tags: [
      ["t", "nostr"],
      ["t", "streets"],
    ],
  },
);
const tokenTarget = alice.note("Nostr 参照から表示されるイベントです。");
const referencedNote = bob.note(
  `リンク、ハッシュタグ、Nostr 参照、カスタム絵文字を含む本文です。 https://example.com/ #nostr nostr:${encodeBech32("note", tokenTarget.id)} :party:`,
  {
    tags: [
      ["t", "nostr"],
      ["emoji", "party", customEmojiFixtureUrl],
    ],
  },
);
const reply = alice.reply("たしかに、署名作業が無いだけでかなり楽ですね。", {
  parent: referencedNote,
});
const quote = carol.quote("この方法なら表示状態をレビューしやすそう。", {
  target: referencedNote,
});
const repost = bob.repost(plainNote);
const like = alice.reaction(plainNote, { type: "like" });
const textReaction = bob.reaction(plainNote, {
  type: "text",
  content: "わかる",
});
const emojiReaction = carol.reaction(plainNote, {
  type: "emoji",
  shortcode: "party",
  url: customEmojiFixtureUrl,
});
const reactionEvent = carol.reaction(referencedNote, { type: "like" });
const unicodeReactionEvent = bob.reaction(referencedNote, {
  type: "text",
  content: "🔥",
});
const customReactionEvent = alice.reaction(referencedNote, {
  type: "emoji",
  shortcode: "party",
  url: customEmojiFixtureUrl,
});
const unknown = alice.unknown(
  31_337,
  "まだ専用レンダラが無い kind でも、内容を失わず表示します。",
  { tags: [["client", "streets Storybook"]] },
);
const missingRepostTarget = alice.note("このイベントは scene へ入れません");
const missingRepost = bob.event({
  kind: 6,
  content: "",
  tags: [
    ["e", missingRepostTarget.id, "", "", missingRepostTarget.pubkey],
    ["p", missingRepostTarget.pubkey],
  ],
});

const scene = (...events: readonly NostrEvent[]): EventScene => ({
  events: [...profiles, ...events],
  viewerPubkey: alice.pubkey,
});

const meta = {
  title: "v1/イベント/EventView",
  component: EventStory,
  parameters: { controls: { disable: true } },
  args: { variant: "full" },
} satisfies Meta<typeof EventStory>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Kind1本文: Story = {
  args: { event: plainNote, scene: scene(plainNote) },
};

export const Kind1Compact: Story = {
  args: {
    event: referencedNote,
    scene: scene(referencedNote),
    variant: "compact",
  },
};

export const Kind1ContentTokens: Story = {
  args: {
    event: referencedNote,
    scene: scene(tokenTarget, referencedNote),
  },
};

export const Kind1返信: Story = {
  args: { event: reply, scene: scene(referencedNote, reply) },
};

export const Kind1引用: Story = {
  args: { event: quote, scene: scene(referencedNote, quote) },
};

export const Kind6リポスト: Story = {
  args: { event: repost, scene: scene(repost) },
};

export const Kind6対象読込中: Story = {
  args: { event: missingRepost, scene: scene(missingRepost) },
};

export const Kind6対象未解決: Story = {
  args: {
    event: missingRepost,
    scene: {
      ...scene(missingRepost),
      unresolvedEventIds: [missingRepostTarget.id],
    },
  },
};

export const Kind7リアクション: Story = {
  args: {
    event: reactionEvent,
    scene: scene(tokenTarget, referencedNote, reactionEvent),
  },
};

export const Kind7Unicodeリアクション: Story = {
  args: {
    event: unicodeReactionEvent,
    scene: scene(tokenTarget, referencedNote, unicodeReactionEvent),
  },
};

export const Kind7CustomEmojiリアクション: Story = {
  args: {
    event: customReactionEvent,
    scene: scene(tokenTarget, referencedNote, customReactionEvent),
  },
};

export const Kind1リアクション一覧: Story = {
  args: {
    event: plainNote,
    scene: scene(plainNote, like, textReaction, emojiReaction),
  },
};

export const 未知Kind: Story = {
  args: { event: unknown, scene: scene(unknown) },
};

export const ミュート済み: Story = {
  args: {
    event: plainNote,
    scene: {
      ...scene(plainNote),
      mutes: [
        {
          target: { type: "pubkey", value: alice.pubkey },
          visibility: "private",
        },
      ],
    },
  },
};
