import { buildChannelMessage } from "@streets/core/nostr/build/channel";
import type { NostrEvent } from "@streets/core/nostr/event";
import { pinNote } from "@streets/core/nostr/pinned-notes";
import {
  EVENT_ACTIONS,
  defaultActionLayout,
} from "@streets/core/settings/action-layout";
import type { Component } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { setActionLayout } from "../../action-layout-setting";
import {
  type EventScene,
  EventSceneProvider,
} from "../../storybook/EventScene";
import { createStoryAuthor } from "../../storybook/story-events";
import EventMenu from "../EventMenu";
import { alice, plain, profiles, scene, viewer } from "./event-story";

const MenuStory: Component<{
  event: NostrEvent;
  scene: EventScene;
  withActions: boolean;
  /** 画面の下端にボタンを置き、欄を空にして全部の操作をメニューに入れる。 */
  crowded?: boolean;
  /** 作者の入れ子のメニューも開く。横に開く分、幅を広げる。 */
  nested?: boolean;
  /** 触る端末の形（ボトムシート）で開く。 */
  sheet?: boolean;
}> = (props) => {
  setActionLayout(
    props.crowded
      ? { bar: [], menu: [...EVENT_ACTIONS] }
      : defaultActionLayout(),
  );
  return (
    <EventSceneProvider scene={props.scene}>
      {/* 右端のボタンから開くので、メニューが左へ広がる分を空けておく。 */}
      <div
        class="flex w-full justify-end"
        classList={{
          "max-w-[360px]": !props.nested,
          "max-w-[720px]": props.nested,
          "h-[calc(100dvh-2rem)] items-end": props.crowded,
        }}
      >
        <EventMenu
          event={props.event}
          withActions={props.withActions}
          defaultOpen
          defaultAuthorOpen={props.nested}
          sheet={props.sheet}
        />
      </div>
    </EventSceneProvider>
  );
};

const meta = {
  title: "イベント/投稿/操作のメニュー",
  component: MenuStory,
  args: { event: plain, scene: scene(plain), withActions: true },
  argTypes: { event: { control: false }, scene: { control: false } },
  // 開いたメニューの高さの分だけ場所を取る。
  decorators: [(Story) => <div class="min-h-[480px]">{Story()}</div>],
} satisfies Meta<typeof MenuStory>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ほかの人の投稿: Story = {};

export const フォロー中でピン留め済み: Story = {
  args: {
    scene: scene(
      plain,
      viewer.follows([alice.pubkey]),
      viewer.event(pinNote(plain.id)(undefined)),
    ),
  },
};

/** PC では、作者の項目を「@名前」の 1 項目にまとめ、その横の入れ子のメニューに出す。 */
export const 作者の入れ子のメニュー: Story = { args: { nested: true } };

const longName = createStoryAuthor(77, {
  name: "とても長い名前のひとがここにいて表示名もメニューの幅に収まらない",
  displayName:
    "とても長い表示名のひとで、メニューの幅を超えて折り返さずに切れる",
});
const longNameNote = longName.note("名前の長い作者の投稿");

export const 作者の名前が長い: Story = {
  args: {
    nested: true,
    event: longNameNote,
    scene: { events: [...profiles, longName.profile(), longNameNote] },
  },
};

const noProfile = createStoryAuthor(88, {});
const noProfileNote = noProfile.note("プロフィールが無い作者の投稿");

/** 名前も画像も無い作者は、npub の先頭と標識で出す。 */
export const 作者のプロフィールが無い: Story = {
  args: {
    nested: true,
    event: noProfileNote,
    scene: { events: [...profiles, noProfileNote] },
  },
};

const channelMessage = alice.event(
  buildChannelMessage("1".repeat(64), "チャンネルでの発言"),
);

/**
 * kind:42 は、ブックマークとピン留めが押せず、返信は出ない（返信はチャンネルの中で書く）。
 * Zap・引用・ミュートなどは通常の投稿と同じ。
 */
export const チャンネルでの発言: Story = {
  args: { event: channelMessage, scene: scene(channelMessage) },
};

const mine = viewer.note("自分の投稿");

/** 自分はフォローもミュートもできないので、その項目を出さない。 */
export const 自分の投稿: Story = {
  args: { event: mine, scene: scene(mine) },
};

/** アクション欄の無い投稿では、中身によらない操作だけを並べる。 */
export const ログインしていない: Story = {
  args: { scene: { events: [...profiles, plain] }, withActions: false },
};

/**
 * 画面の下端で、項目がいちばん多いメニューを開く。上下どちらにも収まらなければ横へ開き、
 * それでも余る分はメニューの中で流す。画面からはみ出さない。
 */
export const 画面の下端で項目が多い: Story = {
  args: { crowded: true },
  parameters: { layout: "fullscreen" },
};

/** スマホの画面では横にも収まらず、メニューの中を流す。ホイールや指で送って確かめる。 */
export const スマホで項目が多い: Story = {
  args: { crowded: true },
  parameters: { layout: "fullscreen" },
  globals: { viewport: { value: "mobile1", isRotated: false } },
};

const mobile = { viewport: { value: "mobile1", isRotated: false } };

/** 触る端末では、ポップアップではなく画面の下から出るパネルに並べる。作者の項目も同じ一覧に続く。 */
export const スマホのボトムシート: Story = {
  args: { sheet: true },
  parameters: { layout: "fullscreen" },
  globals: mobile,
};

/** 項目が多いとき、パネルの高さは画面の 8 割までで、中だけ流す。 */
export const スマホのボトムシートで項目が多い: Story = {
  args: { sheet: true, crowded: true },
  parameters: { layout: "fullscreen" },
  globals: mobile,
};

export const スマホのボトムシートで作者の名前が長い: Story = {
  args: {
    sheet: true,
    event: longNameNote,
    scene: { events: [...profiles, longName.profile(), longNameNote] },
  },
  parameters: { layout: "fullscreen" },
  globals: mobile,
};

export const スマホのボトムシートでプロフィールが無い: Story = {
  args: {
    sheet: true,
    event: noProfileNote,
    scene: { events: [...profiles, noProfileNote] },
  },
  parameters: { layout: "fullscreen" },
  globals: mobile,
};

export const スマホのボトムシートで自分の投稿: Story = {
  args: { sheet: true, event: mine, scene: scene(mine) },
  parameters: { layout: "fullscreen" },
  globals: mobile,
};
