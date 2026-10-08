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
import EventMenu from "../EventMenu";
import { alice, plain, profiles, scene, viewer } from "./event-story";

const MenuStory: Component<{
  event: NostrEvent;
  scene: EventScene;
  withActions: boolean;
  /** 画面の下端にボタンを置き、欄を空にして全部の操作をメニューに入れる。 */
  crowded?: boolean;
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
        class="flex w-full max-w-[360px] justify-end"
        classList={{ "h-[calc(100dvh-2rem)] items-end": props.crowded }}
      >
        <EventMenu
          event={props.event}
          withActions={props.withActions}
          defaultOpen
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
