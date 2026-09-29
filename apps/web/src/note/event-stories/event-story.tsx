import type { LinkCardMode } from "@streets/core/deck/deck";
import {
  type ReactionInput,
  buildReaction,
} from "@streets/core/nostr/build/reaction";
import type { NostrEvent } from "@streets/core/nostr/event";
import { encodeBech32 } from "@streets/core/nostr/nip19";
import {
  type ActionLayout,
  defaultActionLayout,
} from "@streets/core/settings/action-layout";
import type { ContentWarningMode } from "@streets/core/settings/content-warning-setting";
import type { Component } from "solid-js";
import { setActionLayout } from "../../action-layout-setting";
import { setContentWarningMode } from "../../content-warning-setting";
import { setDefaultReaction } from "../../default-reaction-setting";
import avatarUrl from "../../storybook/avatar-fixture.svg";
import emojiUrl from "../../storybook/emoji-fixture.svg";
import {
  type EventScene,
  EventSceneProvider,
} from "../../storybook/EventScene";
import {
  type StoryAuthor,
  createStoryAuthor,
} from "../../storybook/story-events";
import Event, { type EventSize } from "../Event";
import { LinkCardModeProvider } from "../link-card";

export const alice = createStoryAuthor(11, {
  name: "alice",
  displayName: "あいもの",
  picture: avatarUrl,
});
export const bob = createStoryAuthor(22, {
  name: "bob",
  displayName: "ほかのひと",
});
export const carol = createStoryAuthor(33, { name: "carol" });
export const viewer = createStoryAuthor(55, {
  name: "me",
  displayName: "わたし",
});
export const profiles = [
  alice.profile(),
  bob.profile(),
  carol.profile(),
  viewer.profile(),
];

export const plain = alice.note(
  "マルチカラムのクライアントは、1 列に入る情報量が体験を決める。余白は削るところと残すところを分ける。",
);
export const tokens = bob.note(
  `リンク https://example.com/#nostr 、ハッシュタグ #Nostr と #東京 、NIP-21メンション nostr:${encodeBech32("npub", alice.pubkey)} 、裸のNIP-19メンション ${encodeBech32("npub", carol.pubkey)} 、カスタム絵文字 :party: を含む本文。`,
  [
    ["t", "nostr"],
    ["emoji", "party", emojiUrl],
  ],
);
export const react = (author: StoryAuthor, input: ReactionInput) =>
  author.event(buildReaction(plain, input));

type Props = {
  event: NostrEvent;
  scene: EventScene;
  size: EventSize;
  /** 返信のとき、返信先を上に 1 件出す（タイムラインのカラムと同じ）。 */
  replyContext?: boolean;
  expandMedia?: boolean;
  linkCards?: LinkCardMode;
  /** いいねボタンで送るもの。省くとハート。 */
  defaultReaction?: ReactionInput;
  /** 閲覧注意の投稿の扱い。省くと隠す。 */
  contentWarning?: ContentWarningMode;
  /** アクション欄に出す操作。省くと既定の 6 個。 */
  actionLayout?: ActionLayout;
};

export const EventStory: Component<Props> = (props) => {
  // 端末の設定をそのまま差し替える。どのストーリーも必ず当てるので、前の値は残らない。
  setDefaultReaction(props.defaultReaction ?? { type: "like" });
  setContentWarningMode(props.contentWarning ?? "hide");
  setActionLayout(props.actionLayout ?? defaultActionLayout());
  return (
    <EventSceneProvider scene={props.scene}>
      {/* 実際のカラム幅で、名前・時刻・リアクションチップの収まりを見る。 */}
      <div class="w-[360px]">
        <LinkCardModeProvider value={() => props.linkCards ?? "compact"}>
          <Event
            event={props.event}
            size={props.size}
            replyContext={props.replyContext}
            expandMedia={props.expandMedia}
          />
        </LinkCardModeProvider>
      </div>
    </EventSceneProvider>
  );
};

export const scene = (...events: NostrEvent[]): EventScene => ({
  events: [...profiles, ...events],
  viewer,
});

/** 各ファイルの meta に広げて使う。題名はファイルごとに書く（Storybook が静的に読むため）。 */
export const eventStoryMeta = {
  component: EventStory,
  args: { size: "normal" },
  argTypes: {
    size: { control: "inline-radio", options: ["normal", "compact"] },
    event: { control: false },
    scene: { control: false },
    defaultReaction: { control: false },
    actionLayout: { control: false },
  },
} as const;
