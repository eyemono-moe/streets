import {
  buildChannelCreate,
  buildChannelMessage,
  buildChannelMetadata,
} from "@streets/core/nostr/build/channel";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import {
  EventStory,
  alice,
  bob,
  carol,
  eventStoryMeta,
  scene,
} from "./event-story";

const channelCreate = alice.event(
  buildChannelCreate({
    name: "ねこの画像チャンネル",
    about: "ねこの写真を貼る場所",
    relays: ["wss://relay.example/"],
  }),
);
const channelUpdate = alice.event(
  buildChannelMetadata(channelCreate.id, {
    name: "ねこの画像チャンネル（改装中）",
    about: "しばらくお休みします",
    relays: ["wss://relay.example/"],
  }),
);
const channelMessage = alice.event(
  buildChannelMessage(channelCreate.id, "こんばんは。今日もやってますか？"),
);
// 本文に埋め込んだとき（compact）も、チャンネルを開けて、どのチャンネルの発言か分かる。
const channelQuote = bob.quote(channelCreate, "ここのチャンネルおすすめです");
const channelMessageQuote = carol.quote(channelMessage, "この発言が好き");

const bobMessage = bob.event(
  buildChannelMessage(channelCreate.id, "ここは居心地がいいですね"),
);

const meta = {
  ...eventStoryMeta,
  title: "イベント/チャンネル",
} satisfies Meta<typeof EventStory>;

export default meta;
type Story = StoryObj<typeof meta>;

// 検索の結果や通知に出てきたとき。
export const チャンネル: Story = {
  args: { event: channelCreate, scene: scene(channelCreate) },
};
export const 情報の書き換え: Story = {
  args: { event: channelUpdate, scene: scene(channelCreate, channelUpdate) },
};
export const チャンネルでの発言: Story = {
  args: { event: channelMessage, scene: scene(channelCreate, channelMessage) },
};
/** タイムラインのカラムと同じ幅で、compact は操作を出さない（引用の中と同じ）。 */
export const チャンネルでの発言_高密度: Story = {
  args: {
    event: channelMessage,
    scene: scene(channelCreate, channelMessage),
    size: "compact",
  },
};
/** 自分のいいね・リポスト済みなど、アクション欄が普通の投稿と同じ並びで出る。 */
export const ほかの人のチャンネルでの発言: Story = {
  args: {
    event: bobMessage,
    scene: scene(channelCreate, bobMessage),
  },
};
export const チャンネルを埋め込んだ投稿: Story = {
  args: {
    event: channelQuote,
    scene: scene(channelQuote, channelCreate),
  },
};
export const チャンネルでの発言を埋め込んだ投稿: Story = {
  args: {
    event: channelMessageQuote,
    scene: scene(channelMessageQuote, channelMessage, channelCreate),
  },
};
export const チャンネルが読めない発言: Story = {
  args: {
    event: channelMessage,
    scene: { ...scene(channelMessage), missingIds: [channelCreate.id] },
  },
};
