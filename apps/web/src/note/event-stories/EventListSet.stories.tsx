import type { RelayUrl } from "@streets/core/relay/relay-connection";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import avatarUrl from "../../storybook/avatar-fixture.svg";
import mediaUrl from "../../storybook/media-landscape.svg";
import { createStoryAuthor } from "../../storybook/story-events";
import { StoryRelayEdit } from "../../storybook/StoryRelayEdit";
import {
  EventStory,
  alice,
  bob,
  carol,
  eventStoryMeta,
  plain,
  scene,
} from "./event-story";

const others = Array.from({ length: 9 }, (_, i) =>
  createStoryAuthor(200 + i, { name: `newcomer${i + 1}` }),
);

const relaySet = alice.event({
  kind: 30_002,
  content: "",
  tags: [
    ["d", "jp"],
    ["title", "日本語のリレー"],
    ["description", "日本語の投稿をよく読めるリレーを集めました"],
    ["relay", "wss://yabu.me/"],
    ["relay", "wss://nostr.compile-error.net/"],
    ["relay", "wss://r.kojira.io/"],
    ["relay", "wss://relay-jp.nostr.wirednet.jp/"],
    [
      "relay",
      "wss://very-long-subdomain-for-a-community-relay.example-nostr-provider.com/",
    ],
  ],
});
const fewRelays = alice.event({
  kind: 30_002,
  content: "",
  tags: [
    ["d", "write"],
    ["relay", "wss://nos.lol/"],
  ],
});
const article = carol.event({
  kind: 30_023,
  content: "読み取り層を作り直した。",
  tags: [
    ["d", "read-layer"],
    ["title", "Nostr の読み取り層を作り直した話"],
    ["summary", "購読をまとめ、リレーの数を抑える。"],
  ],
});
const bookmarkSet = alice.event({
  kind: 30_003,
  content: "",
  tags: [
    ["d", "later"],
    ["title", "あとで読む"],
    ["e", plain.id],
    ["a", `30023:${carol.pubkey}:read-layer`],
    ["e", "f".repeat(64)],
  ],
});
const curation = bob.event({
  kind: 30_004,
  content: "",
  tags: [
    ["d", "outbox"],
    ["title", "Outbox モデルの記事"],
    ["image", mediaUrl],
    ["a", `30023:${carol.pubkey}:read-layer`],
  ],
});
const missingFirst = alice.event({
  kind: 30_003,
  content: "",
  tags: [
    ["d", "gone"],
    ["title", "消えた投稿だけのブックマーク"],
    ["e", "e".repeat(64)],
  ],
});
const interests = alice.event({
  kind: 30_015,
  content: "",
  tags: [
    ["d", "topics"],
    ["title", "好きな話題"],
    ["t", "nostr"],
    ["t", "zap"],
    ["t", "東京"],
  ],
});
const starterPack = bob.event({
  kind: 39_089,
  content: "",
  tags: [
    ["d", "welcome"],
    ["title", "Nostr をはじめた人へ"],
    ["description", "最初にフォローすると、タイムラインがにぎやかになる人たち"],
    ["image", mediaUrl],
    ...others.map((other) => ["p", other.pubkey]),
  ],
});
/** リレーが自分について答える内容。答えないリレー（ほかの URL）は名前を URL から作る。 */
const relayInfo = {
  "wss://yabu.me/": {
    name: "やぶみ",
    description: "日本語の投稿が多いリレー。どなたでも書き込めます。",
    icon: avatarUrl,
    pubkey: carol.pubkey,
    contact: "mailto:admin@example.com",
  },
  "wss://nostr.compile-error.net/": {
    name: "nostr-relay",
    description: "とても長い説明を書いたリレー。".repeat(8),
  },
  "wss://r.kojira.io/": { name: "kojirelay", icon: avatarUrl },
};
const relayScene = (...events: Parameters<typeof scene>) => ({
  ...scene(...events),
  relayInfo,
});

const untitled = alice.event({ kind: 30_003, content: "", tags: [["d", ""]] });
const quote = bob.quote(relaySet, "このリレー、どれも速い。");

/** 自分のリレー：yabu.me を読み込みだけに使っている。 */
const withRelayEdit = (Story: () => unknown) => (
  <StoryRelayEdit
    own={[{ url: "wss://yabu.me/" as RelayUrl, read: true, write: false }]}
  >
    {Story() as never}
  </StoryRelayEdit>
);

const meta = {
  ...eventStoryMeta,
  title: "イベント/NIP-51 のリスト",
} satisfies Meta<typeof EventStory>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * 先頭の 3 個だけ出す。「自分も使う」で足し、「使用中」で使い方を変える。
 * 押すと、入っているリレーのカラムを開く。
 */
export const リレーセット: Story = {
  args: { event: relaySet, scene: relayScene(relaySet) },
  decorators: [withRelayEdit],
};

export const リレーセット_狭いカラム: Story = {
  args: { event: relaySet, scene: relayScene(relaySet), width: 280 },
  decorators: [withRelayEdit],
};

export const リレーセット_題名なし: Story = {
  args: { event: fewRelays, scene: relayScene(fewRelays) },
  decorators: [withRelayEdit],
};

/** 引用の中では、リレーの名前だけを並べる。 */
export const 引用されたリレーセット: Story = {
  args: { event: quote, scene: relayScene(quote, relaySet) },
  decorators: [withRelayEdit],
};

/** ログインしていないと「自分も使う」は出ない。 */
export const リレーセット_ログインなし: Story = {
  args: { event: relaySet, scene: relayScene(relaySet) },
};

export const ブックマークセット: Story = {
  args: { event: bookmarkSet, scene: scene(bookmarkSet, plain, article) },
};

export const まとめ_画像あり: Story = {
  args: { event: curation, scene: scene(curation, article) },
};

export const 先頭が読み込めない: Story = {
  args: { event: missingFirst, scene: scene(missingFirst) },
};

export const 好きな話題: Story = {
  args: { event: interests, scene: scene(interests) },
};

export const スターターパック: Story = {
  args: {
    event: starterPack,
    scene: scene(starterPack, ...others.map((other) => other.profile())),
  },
};

export const コンパクト: Story = {
  args: { event: starterPack, scene: scene(starterPack), size: "compact" },
};

export const 題名も中身も無い: Story = {
  args: { event: untitled, scene: scene(untitled) },
};
