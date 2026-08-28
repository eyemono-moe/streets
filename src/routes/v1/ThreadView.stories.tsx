import type { Component } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import type { NostrEvent } from "../../core/nostr/event";
import type { SectionStatus } from "../../core/read/source";
import {
  type EventScene,
  EventSceneProvider,
} from "../../storybook/EventScene";
import { createStoryAuthor } from "../../storybook/story-events";
import ThreadView from "./ThreadView";

type ThreadStoryProps = {
  events: NostrEvent[];
  focusId: string;
  phase: SectionStatus["phase"];
  scene: EventScene;
};

const ThreadStory: Component<ThreadStoryProps> = (props) => (
  <EventSceneProvider scene={props.scene}>
    <ThreadView
      events={() => props.events}
      focusId={props.focusId}
      status={() => ({ phase: props.phase })}
    />
  </EventSceneProvider>
);

const alice = createStoryAuthor(44, {
  name: "alice",
  displayName: "Alice / アリス",
});
const bob = createStoryAuthor(55, { name: "bob", displayName: "Bob" });
const carol = createStoryAuthor(66, {
  name: "carol",
  displayName: "Carol",
});
const profiles = [alice.profile(), bob.profile(), carol.profile()];
const root = alice.note(
  "Storybook を先に整えると、どの表示から楽になるだろう？",
);
const parent = bob.reply("まずイベントとスレッドを並べたいです。", {
  parent: root,
});
const focus = carol.reply("状態違いも同じ画面で比較できると助かります。", {
  parent,
});
const firstReply = alice.reply("loading と未解決は分けて置きましょう。", {
  parent: focus,
});
const secondReply = bob.reply("dark mode もツールバーで切り替えたいです。", {
  parent: focus,
});
const completeEvents = [root, parent, focus, firstReply, secondReply];
const completeScene: EventScene = {
  events: [...profiles, ...completeEvents],
  viewerPubkey: alice.pubkey,
};

const missingRoot = alice.note("scene へ入らない祖先");
const orphanedFocus = bob.reply("祖先を取得できない返信です。", {
  parent: missingRoot,
});
const incompleteScene: EventScene = {
  events: [...profiles, orphanedFocus],
  viewerPubkey: alice.pubkey,
};

const meta = {
  title: "v1/イベント/ThreadView",
  component: ThreadStory,
  parameters: { controls: { disable: true } },
  args: {
    events: completeEvents,
    focusId: focus.id,
    phase: "settled",
    scene: completeScene,
  },
} satisfies Meta<typeof ThreadStory>;

export default meta;
type Story = StoryObj<typeof meta>;

export const 祖先と複数返信: Story = {};

export const 祖先取得中: Story = {
  args: {
    events: [orphanedFocus],
    focusId: orphanedFocus.id,
    phase: "streaming",
    scene: incompleteScene,
  },
};

export const 祖先取得失敗: Story = {
  args: {
    events: [orphanedFocus],
    focusId: orphanedFocus.id,
    phase: "settled",
    scene: incompleteScene,
  },
};

export const Focusのみ先に表示: Story = {
  args: {
    events: [],
    focusId: focus.id,
    phase: "initial",
    scene: completeScene,
  },
};
