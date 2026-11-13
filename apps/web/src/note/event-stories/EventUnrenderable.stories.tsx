import type { NostrEvent } from "@streets/core/nostr/event";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import {
  EventStory,
  alice,
  bob,
  carol,
  eventStoryMeta,
  scene,
} from "./event-story";

/** 専用の描き方が無く、名前を持つ kind（NIP-84 のハイライト）。説明は `alt` にある。 */
const highlight = alice.event({
  kind: 9802,
  tags: [
    ["r", "https://example.invalid/essay"],
    ["alt", "記事「マルチカラムの作り方」からのハイライト"],
  ],
  content: "カラムは一覧ではなく、問いの形をしている。",
});
const calendar = alice.event({
  kind: 31923,
  tags: [
    ["d", "meetup"],
    ["title", "Nostr 勉強会"],
    ["start", "1720000000"],
  ],
  content: "",
});
const nameless = alice.event({ kind: 12345, tags: [], content: "{}" });
const longAlt = alice.event({
  kind: 30402,
  tags: [
    ["d", "bike"],
    [
      "alt",
      "売り物: 自転車。".repeat(30) + "細いカラムでも、説明は 4 行で切る。",
    ],
  ],
  content: "",
});
/** 暗号化したダイレクトメッセージ。作った人も説明も出さない。 */
const encrypted = alice.event({ kind: 4, tags: [], content: "暗号文?iv=..." });
const reposted = carol.event({
  kind: 16,
  tags: [
    ["e", highlight.id, ""],
    ["k", "9802"],
    ["p", highlight.pubkey],
  ],
  content: JSON.stringify(highlight),
});
const quote = bob.quote(highlight, "これは良い一文。");

const meta = {
  ...eventStoryMeta,
  title: "イベント/描けないもの",
} satisfies Meta<typeof EventStory>;

export default meta;
type Story = StoryObj<typeof meta>;

export const 説明あり: Story = {
  args: { event: highlight, scene: scene(highlight) },
};

export const 説明なし: Story = {
  args: { event: calendar, scene: scene(calendar) },
};

/** NIPs で名前が分からない kind は番号だけを出す。 */
export const 名前の無いkind: Story = {
  args: { event: nameless, scene: scene(nameless) },
};

export const 長い説明: Story = {
  args: { event: longAlt, scene: scene(longAlt) },
};

export const 英語: Story = {
  args: { event: highlight, scene: scene(highlight) },
  globals: { locale: "en" },
};

export const 高密度: Story = {
  args: { event: highlight, scene: scene(highlight), size: "compact" },
};

export const 暗号化したもの: Story = {
  args: { event: encrypted, scene: scene(encrypted) },
};

export const 汎用リポストの中: Story = {
  args: { event: reposted, scene: scene(reposted) },
};

export const 引用の中: Story = {
  args: { event: quote, scene: scene(quote, highlight) },
};

/**
 * 形の崩れたイベント（リレーから来るものは形を保証されない）。描画の途中で投げても、
 * この 1 件だけを「表示できませんでした」に置き換え、周りは描き続ける。
 */
export const 描けないイベント: Story = {
  args: {
    event: { ...nameless, kind: 1, tags: null } as unknown as NostrEvent,
    scene: scene(),
  },
};
