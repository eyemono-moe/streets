import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { createStoryAuthor } from "../../storybook/story-events";
import {
  EventStory,
  alice,
  bob,
  carol,
  eventStoryMeta,
  scene,
} from "./event-story";

const others = Array.from({ length: 9 }, (_, i) =>
  createStoryAuthor(100 + i, { name: `person${i + 1}` }),
);
const followSet = (
  identifier: string,
  tags: string[][],
  members: readonly string[],
) =>
  alice.event({
    kind: 30_000,
    content: "",
    tags: [
      ["d", identifier],
      ...tags,
      ...members.map((pubkey) => ["p", pubkey]),
    ],
  });

const developers = followSet(
  "dev",
  [
    ["title", "開発者"],
    ["description", "Nostr のクライアントやリレーを作っている人たち"],
  ],
  [bob.pubkey, carol.pubkey, ...others.map((other) => other.pubkey)],
);
const empty = followSet("empty", [["title", "作ったばかりのリスト"]], []);
const longText = followSet(
  "long",
  [
    [
      "title",
      "とても長い名前をつけたリストで、狭いカラムでは途中で切れる".repeat(2),
    ],
    [
      "description",
      "説明もとても長く書いてあって、一行には収まらない。".repeat(3),
    ],
  ],
  [bob.pubkey, carol.pubkey],
);
const untitled = followSet("", [], [bob.pubkey]);
const quote = bob.quote(developers, "このリスト、おすすめ。");

const meta = {
  ...eventStoryMeta,
  title: "イベント/リスト",
} satisfies Meta<typeof EventStory>;

export default meta;
type Story = StoryObj<typeof meta>;

/** 押すと、リストのメンバーの投稿を流すカラムを開く。 */
export const リスト: Story = {
  args: { event: developers, scene: scene(developers) },
};

export const コンパクト: Story = {
  args: { event: developers, scene: scene(developers), size: "compact" },
};

export const 引用されたリスト: Story = {
  args: { event: quote, scene: scene(quote, developers) },
};

export const まだ誰もいない: Story = {
  args: { event: empty, scene: scene(empty) },
};

export const 長い名前と説明: Story = {
  args: { event: longText, scene: scene(longText) },
};

export const 名前が無い: Story = {
  args: { event: untitled, scene: scene(untitled) },
};
