import type { Channel } from "@streets/core/nostr/channel";
import type { ChannelEntry } from "@streets/core/view/channel-directory";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { EventSceneProvider } from "../storybook/EventScene";
import ChannelListView from "./ChannelListView";

const now = Math.floor(Date.now() / 1000);
const entry = (
  n: number,
  name: string | undefined,
  about: string | undefined,
  options: { lastMessageAt?: number; favorite?: boolean } = {},
): ChannelEntry => {
  const channel: Channel = {
    id: `${n}`.padStart(64, "0"),
    creator: "c".repeat(64),
    metadata: { name, about, relays: [] },
    updatedAt: 0,
  };
  return { channel, favorite: options.favorite ?? false, ...options };
};

const favorites = [
  entry(1, "さびれたスナック", "夜にだらだら話す場所", {
    lastMessageAt: now - 120,
    favorite: true,
  }),
  entry(2, "Nostr麻雀開発部", "麻雀クライアントを作っています", {
    lastMessageAt: now - 86_400,
    favorite: true,
  }),
  entry(3, "しずかな部屋", undefined, { favorite: true }),
];
const active = [
  entry(4, "persona-bubble-field prototype", "試作の話", {
    lastMessageAt: now - 3_600,
  }),
  entry(5, "Streets のフィードバック", "要望・不具合・使い方の相談", {
    lastMessageAt: now - 2 * 86_400,
  }),
  entry(
    6,
    "とても長い名前のチャンネルで、一覧の幅に収まらないときにどう見えるかを確かめる",
    "説明もとても長く、一覧の 1 行に収まらないときは末尾を省略して出す",
    { lastMessageAt: now - 3 * 86_400 },
  ),
];
const many = Array.from({ length: 230 }, (_, i) =>
  entry(100 + i, `チャンネル ${i + 1}`, undefined),
);

type Props = Parameters<typeof ChannelListView>[0];

const meta = {
  title: "チャット/チャンネルの一覧",
  component: (props: Props) => (
    <EventSceneProvider scene={{ events: [] }}>
      <div class="w-95 border border-primary bg-primary">
        <ChannelListView {...props} />
      </div>
    </EventSceneProvider>
  ),
  args: {
    searching: false,
    query: "",
    favorites,
    active,
    results: [],
    favoritesSettled: true,
    activeSettled: true,
    allSettled: true,
    onSearch: () => {},
    onQuery: () => {},
    onOpen: () => {},
  },
  argTypes: {
    favorites: { control: false },
    active: { control: false },
    results: { control: false },
  },
} satisfies Meta<Props>;

export default meta;
type Story = StoryObj<typeof meta>;

export const 普段: Story = {};
export const お気に入りが無い: Story = { args: { favorites: [] } };
export const 読み込み中: Story = {
  args: {
    favorites: [],
    active: [],
    favoritesSettled: false,
    activeSettled: false,
  },
};
export const 最近アクティブが無い: Story = { args: { active: [] } };
export const 探している: Story = {
  args: {
    searching: true,
    query: "スナック",
    results: [
      favorites[0] as ChannelEntry,
      entry(7, "スナック研究会", "スナックの話をしよう"),
    ],
  },
};
export const 探して見つからない: Story = {
  args: { searching: true, query: "存在しない", results: [] },
};
export const すべてを取得中: Story = {
  args: { searching: true, allSettled: false, results: [] },
};
export const 探すと多すぎる: Story = {
  args: { searching: true, results: many },
};
export const 狭いカラム: Story = {
  parameters: { viewport: { defaultViewport: "column320" } },
};
/** カラムを追加のパネルの中。行に「覗く」が付く。 */
export const カラムを追加のパネル: Story = {
  args: { onPeek: () => {} },
};
