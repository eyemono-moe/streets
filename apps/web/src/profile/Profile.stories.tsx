import type { NostrEvent } from "@streets/core/nostr/event";
import { encodeBech32 } from "@streets/core/nostr/nip19";
import type { Component } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { type EventScene, EventSceneProvider } from "../storybook/EventScene";
import avatarUrl from "../storybook/avatar-fixture.svg";
import { createStoryAuthor } from "../storybook/story-events";
import ProfileHeaderView from "./ProfileHeaderView";
import ProfileList from "./ProfileList";
import UserCard from "./UserCard";

const alice = createStoryAuthor(11, {
  name: "alice",
  displayName: "あいもの",
  picture: avatarUrl,
  about: "Nostr のクライアントを作っています。",
  banner: avatarUrl,
});
const bob = createStoryAuthor(22, {
  name: "bob",
  displayName: "ほかのひと",
  about: "リレー運用。",
});
const carol = createStoryAuthor(33, { name: "carol" });
const wordy = createStoryAuthor(66, {
  name: "wordy",
  displayName: "よく喋る人",
  picture: avatarUrl,
  about: Array.from(
    { length: 6 },
    (_, index) =>
      `${index + 1} 行目の自己紹介。長い文章でもカラムの幅からはみ出さないことを確かめる。`,
  ).join("\n"),
});
const longName = createStoryAuthor(77, {
  name: "very-long-handle-that-will-not-fit-in-one-column",
  displayName: "とても長い表示名を持っている人のためのユーザー",
  about: "名前も id もはみ出さずに切れることを確かめる。",
});
const viewer = createStoryAuthor(55, { name: "me", displayName: "わたし" });
const linkedNote = alice.note("自己紹介のリンクから開く投稿");
const linked = createStoryAuthor(88, {
  name: "links",
  displayName: ":wave: リンクの人",
  about: `Web: https://example.com/\n人（NIP-21）: nostr:${encodeBech32("npub", alice.pubkey)}\n人（裸のNIP-19）: ${encodeBech32("npub", bob.pubkey)}\n投稿（裸のNIP-19）: ${encodeBech32("note", linkedNote.id)}`,
});
const linkedProfile = linked.profile([["emoji", "wave", avatarUrl]]);

const profiles = [
  alice.profile(),
  bob.profile(),
  carol.profile(),
  wordy.profile(),
  longName.profile(),
  viewer.profile(),
  linkedProfile,
];
/** 閲覧者は alice だけをフォローしている。ボタンの 2 つの状態を 1 画面で見る。 */
const viewerFollows = viewer.follows([alice.pubkey]);

const scene = (...events: NostrEvent[]): EventScene => ({
  events: [...profiles, viewerFollows, ...events],
  viewer,
});

type HeaderProps = {
  pubkey: string;
  followeeCount: number;
  followerCount: number;
  scene: EventScene;
};

const HeaderStory: Component<HeaderProps> = (props) => (
  <EventSceneProvider scene={props.scene}>
    {/* カラムと同じ幅に載せる。ここでの折り返しが本番の折り返し。 */}
    <div class="w-[360px] border border-primary">
      <ProfileHeaderView
        pubkey={props.pubkey}
        followeeCount={props.followeeCount}
        followerCount={props.followerCount}
        onOpenFollowees={() => {}}
        onOpenFollowers={() => {}}
      />
    </div>
  </EventSceneProvider>
);

const meta = {
  title: "ユーザー/ProfileHeaderView",
  component: HeaderStory,
  args: { followeeCount: 128, followerCount: 64, scene: scene(linkedNote) },
  argTypes: { scene: { control: false }, pubkey: { control: false } },
} satisfies Meta<typeof HeaderStory>;

export default meta;
type Story = StoryObj<typeof meta>;

export const フォローしていない人: Story = {
  args: { pubkey: bob.pubkey },
};

export const フォロー中の人: Story = {
  args: { pubkey: alice.pubkey },
};

export const 自分: Story = {
  args: { pubkey: viewer.pubkey },
};

export const 画像も自己紹介もない: Story = {
  args: { pubkey: carol.pubkey, followeeCount: 0, followerCount: 0 },
};

export const 自己紹介が長い: Story = {
  args: { pubkey: wordy.pubkey },
};

export const リンクとカスタム絵文字: Story = {
  args: { pubkey: linked.pubkey },
};

export const ログインしていない: Story = {
  args: { pubkey: alice.pubkey, scene: { events: profiles } },
};

export const 保存に失敗する: Story = {
  args: { pubkey: bob.pubkey, scene: { ...scene(), failWrites: true } },
};

const ListStory: Component<{
  people: string[];
  settled: boolean;
  scene: EventScene;
}> = (props) => (
  <EventSceneProvider scene={props.scene}>
    <div class="w-[360px] border border-primary">
      <ProfileList
        people={props.people}
        settled={props.settled}
        empty="まだ誰もフォローしていません。"
      />
    </div>
  </EventSceneProvider>
);

export const 一覧: StoryObj<typeof ListStory> = {
  render: (props) => <ListStory {...props} />,
  args: {
    people: [
      alice.pubkey,
      bob.pubkey,
      carol.pubkey,
      wordy.pubkey,
      longName.pubkey,
    ],
    settled: true,
    scene: scene(),
  },
};

export const 一覧が空: StoryObj<typeof ListStory> = {
  render: (props) => <ListStory {...props} />,
  args: { people: [], settled: true, scene: scene() },
};

export const 一覧を取得中: StoryObj<typeof ListStory> = {
  render: (props) => <ListStory {...props} />,
  args: { people: [], settled: false, scene: scene() },
};

const CardStory: Component<{ pubkey: string; scene: EventScene }> = (props) => (
  <EventSceneProvider scene={props.scene}>
    {/* 実際は浮かせて出す。枠と影はホバーカード側が持つ。 */}
    <div class="w-max overflow-hidden rounded-3 border border-primary">
      <UserCard pubkey={props.pubkey} />
    </div>
  </EventSceneProvider>
);

export const 名刺: StoryObj<typeof CardStory> = {
  render: (props) => <CardStory {...props} />,
  args: { pubkey: alice.pubkey, scene: scene() },
};

export const 名刺_情報が少ない: StoryObj<typeof CardStory> = {
  render: (props) => <CardStory {...props} />,
  args: { pubkey: carol.pubkey, scene: scene() },
};

export const 名刺_自己紹介が長い: StoryObj<typeof CardStory> = {
  render: (props) => <CardStory {...props} />,
  args: { pubkey: wordy.pubkey, scene: scene() },
};
