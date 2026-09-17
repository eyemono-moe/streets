import type { NostrEvent } from "@streets/core/nostr/event";
import type { Component } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { type EventScene, EventSceneProvider } from "../storybook/EventScene";
import avatarUrl from "../storybook/avatar-fixture.svg";
import { createStoryAuthor } from "../storybook/story-events";
import ProfileHeaderView from "./ProfileHeaderView";
import ProfileList from "./ProfileList";

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
const viewer = createStoryAuthor(55, { name: "me", displayName: "わたし" });

const profiles = [
  alice.profile(),
  bob.profile(),
  carol.profile(),
  wordy.profile(),
  viewer.profile(),
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
  args: { followeeCount: 128, followerCount: 64, scene: scene() },
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
    people: [alice.pubkey, bob.pubkey, carol.pubkey, wordy.pubkey],
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
