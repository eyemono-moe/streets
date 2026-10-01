import type { NostrEvent } from "@streets/core/nostr/event";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import {
  EventStory,
  alice,
  bob,
  carol,
  eventStoryMeta,
  scene,
  viewer,
} from "./event-story";

const now = Math.floor(Date.now() / 1000);
const DAY = 86_400;

const poll = (content: string, options: string[], tags: string[][] = []) =>
  alice.event({
    kind: 1068,
    content,
    tags: [
      ...options.map((label, i) => ["option", `opt${i}`, label]),
      ["relay", "wss://storybook.invalid/"],
      ...tags,
    ],
  });
const answer = (
  who: {
    event: (draft: {
      kind: number;
      content: string;
      tags: string[][];
    }) => NostrEvent;
  },
  target: NostrEvent,
  ...choices: string[]
) =>
  who.event({
    kind: 1018,
    content: "",
    tags: [["e", target.id], ...choices.map((id) => ["response", id])],
  });

const lunch = poll(
  "今日のお昼、何にする？",
  ["ラーメン", "カレー", "そば", "パン"],
  [["endsAt", String(now + 2 * DAY + 60)]],
);
const lunchVotes = [
  answer(bob, lunch, "opt0"),
  answer(carol, lunch, "opt0"),
  answer(bob, lunch, "opt1"),
];
const places = poll(
  "行ってみたい場所は？",
  ["海", "山", "街"],
  [
    ["polltype", "multiplechoice"],
    ["endsAt", String(now + 5 * 3600 + 60)],
  ],
);
const closed = poll(
  "締め切った投票",
  ["はい", "いいえ"],
  [["endsAt", String(now - DAY)]],
);
const longOptions = poll("選択肢が長い投票。狭いカラムで折り返して読めるか。", [
  "とても長い選択肢で、狭いカラムでは折り返して読める".repeat(2),
  "短い",
]);
const quote = bob.quote(lunch, "みんな投票して！");

const meta = {
  ...eventStoryMeta,
  title: "イベント/投票",
} satisfies Meta<typeof EventStory>;

export default meta;
type Story = StoryObj<typeof meta>;

/** 選んでから「投票する」を押す。押すと結果に切り替わる。 */
export const まだ投票していない: Story = {
  args: { event: lunch, scene: scene(lunch, ...lunchVotes) },
};

export const いくつでも選べる: Story = {
  args: { event: places, scene: scene(places) },
};

export const 投票した後: Story = {
  args: {
    event: lunch,
    scene: scene(lunch, ...lunchVotes, answer(viewer, lunch, "opt1")),
  },
};

export const 締め切った後: Story = {
  args: {
    event: closed,
    scene: scene(closed, answer(bob, closed, "opt0")),
  },
};

export const まだ誰も投票していない: Story = {
  args: { event: closed, scene: scene(closed) },
};

export const ログインしていない: Story = {
  args: {
    event: lunch,
    scene: { ...scene(lunch, ...lunchVotes), viewer: undefined },
  },
};

export const 長い選択肢: Story = {
  args: { event: longOptions, scene: scene(longOptions) },
};

/** 引用の中からは投票させず、途中の結果だけを見せる。 */
export const 引用された投票: Story = {
  args: { event: quote, scene: scene(quote, lunch, ...lunchVotes) },
};

export const 投票に失敗する: Story = {
  args: {
    event: lunch,
    scene: { ...scene(lunch, ...lunchVotes), failWrites: true },
  },
};
