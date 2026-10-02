import type { NostrEvent } from "@streets/core/nostr/event";
import { pinNote } from "@streets/core/nostr/pinned-notes";
import { defaultActionLayout } from "@streets/core/settings/action-layout";
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
}> = (props) => {
  setActionLayout(defaultActionLayout());
  return (
    <EventSceneProvider scene={props.scene}>
      {/* 右端のボタンから開くので、メニューが左へ広がる分を空けておく。 */}
      <div class="flex w-[360px] justify-end">
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
  decorators: [(Story) => <div class="h-[480px]">{Story()}</div>],
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

const mine = viewer.note("自分の投稿");

/** 自分はフォローもミュートもできないので、その項目を出さない。 */
export const 自分の投稿: Story = {
  args: { event: mine, scene: scene(mine) },
};

/** アクション欄の無い投稿では、中身によらない操作だけを並べる。 */
export const ログインしていない: Story = {
  args: { scene: { events: [...profiles, plain] }, withActions: false },
};
