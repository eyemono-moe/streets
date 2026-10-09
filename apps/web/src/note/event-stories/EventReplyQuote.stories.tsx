import type { MuteEntry } from "@streets/core/moderation/mute-list";
import { encodeNaddr } from "@streets/core/nostr/nip19";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { createStoryAuthor } from "../../storybook/story-events";
import {
  EventStory,
  alice,
  bob,
  carol,
  eventStoryMeta,
  plain,
  scene,
  viewer,
} from "./event-story";

const reply = alice.reply(plain, "返信の本文。");
const muteReply = bob.reply(plain, "ミュートしている人への返信。");
const muteQuote = bob.quote(plain, "ミュートしている人の投稿を引用。");
const muteAlice: MuteEntry[] = [
  { target: { type: "pubkey", value: alice.pubkey }, visibility: "private" },
];
const quoted = bob.note("引用されたノートの本文。");
const quote = alice.quote(quoted, "引用つきのノート。");
const quoteOfQuote = carol.quote(
  quote,
  "引用の引用。中の引用は取りにいかない。",
);

const longQuoted = bob.note(
  "引用される側の本文がとても長いとき。1 行に収まらない分は、本文の先頭だけを残して切る。マルチカラムのクライアントは、1 列に入る情報量が体験を決める。",
);
const compactQuote = alice.quote(quoted, "高密度で引用したノート。");
const compactLongQuote = alice.quote(longQuoted, "長い本文を引用。");
const noProfileQuoted = createStoryAuthor(77, {}).note(
  "プロフィールが無い人の投稿。",
);
const compactNoProfileQuote = alice.quote(
  noProfileQuoted,
  "プロフィール無しを引用。",
);

const naddrOf = (identifier: string) =>
  encodeNaddr({ identifier, pubkey: bob.pubkey, eventKind: 30_023 });
const article = bob.event({
  kind: 30_023,
  tags: [
    ["d", "streets"],
    ["title", "住所で指された記事"],
  ],
  content: "置換可能イベントは、版ではなく住所で引用される。",
});
const addressQuote = alice.note(
  `住所で引用したノート。\nnostr:${naddrOf("streets")}`,
);
const missingAddressQuote = alice.note(
  `住所で引用したノート。\nnostr:${naddrOf("gone")}`,
);

const meta = {
  ...eventStoryMeta,
  title: "イベント/投稿/返信・引用",
} satisfies Meta<typeof EventStory>;

export default meta;
type Story = StoryObj<typeof meta>;

export const 返信: Story = { args: { event: reply, scene: scene(reply) } };

/** タイムラインでは、返信先を 1 件だけ線でつないで上に出す。 */
export const 返信先つき: Story = {
  args: { event: reply, scene: scene(reply, plain), replyContext: true },
};

/** 返信先がまだ手元に無いとき。連鎖して取りにいかないので、ここで止まる。 */
export const 返信先が見つからない: Story = {
  args: { event: reply, scene: scene(reply), replyContext: true },
};

/** 返信先の人をミュートしているとき。返信は出し、返信先は押すまで 1 行に畳む。 */
export const 返信先がミュートの対象: Story = {
  args: {
    event: muteReply,
    scene: {
      ...scene(muteReply, plain),
      mutes: muteAlice,
    },
    replyContext: true,
  },
};

/** 引用した投稿がミュートの対象のとき。引用カードの中を押すまで 1 行に畳む。 */
export const 引用元がミュートの対象: Story = {
  args: {
    event: muteQuote,
    scene: { ...scene(muteQuote, plain), mutes: muteAlice },
  },
};

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

/** naddr の引用は、その住所の最新版を取りにいく。 */
export const 住所の引用: Story = {
  args: { event: addressQuote, scene: scene(addressQuote, article) },
};

export const 住所の引用が見つからない: Story = {
  args: { event: missingAddressQuote, scene: scene(missingAddressQuote) },
};

/** 高密度では、引用を作者名と本文の先頭を並べた 1 行にする。 */
export const 高密度の引用: Story = {
  args: {
    event: compactQuote,
    scene: scene(compactQuote, quoted),
    size: "compact",
  },
};

export const 高密度の引用が取得中: Story = {
  args: { event: compactQuote, scene: scene(compactQuote), size: "compact" },
};

export const 高密度の引用が見つからない: Story = {
  args: {
    event: compactQuote,
    scene: { ...scene(compactQuote), missingIds: [quoted.id] },
    size: "compact",
  },
};

export const 高密度の引用の本文が長い: Story = {
  args: {
    event: compactLongQuote,
    scene: scene(compactLongQuote, longQuoted),
    size: "compact",
  },
};

export const 高密度の引用の作者のプロフィールが無い: Story = {
  args: {
    event: compactNoProfileQuote,
    scene: {
      events: [compactNoProfileQuote, noProfileQuoted],
      viewer,
    },
    size: "compact",
  },
};

export const 高密度の引用の幅が狭い: Story = {
  args: {
    event: compactLongQuote,
    scene: scene(compactLongQuote, longQuoted),
    size: "compact",
    width: 240,
  },
};
