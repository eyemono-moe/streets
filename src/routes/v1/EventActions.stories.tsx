import type { Component } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, userEvent, within } from "storybook/test";
import type { NostrEvent } from "../../core/nostr/event";
import {
  type EventScene,
  EventSceneProvider,
} from "../../storybook/EventScene";
import { createStoryAuthor } from "../../storybook/story-events";
import EventView from "./EventView";
import { type EventActions, EventActionsProvider } from "./event-actions";

type EventActionsStoryProps = {
  event: NostrEvent;
  scene: EventScene;
  actions: EventActions;
};

const EventActionsStory: Component<EventActionsStoryProps> = (props) => (
  <EventSceneProvider scene={props.scene}>
    <EventActionsProvider value={props.actions}>
      <div class="w-95 border-primary border-y">
        <EventView id={props.event.id} variant="full" />
      </div>
    </EventActionsProvider>
  </EventSceneProvider>
);

const alice = createStoryAuthor(71, {
  name: "alice",
  displayName: "Alice / アリス",
});
const bob = createStoryAuthor(72, {
  name: "bob",
  displayName: "Bob",
});
const note = bob.note(
  "アクション列から返信・リポスト・Likeを送れるようになりました。",
);
const like = alice.reaction(note, { type: "like" });
const repost = alice.repost(note);
const notification = alice.reaction(note, { type: "text", content: "🥰" });
const profiles = [alice.profile(), bob.profile()];

const scene = (...events: readonly NostrEvent[]): EventScene => ({
  events: [...profiles, ...events],
  viewerPubkey: alice.pubkey,
});

const successActions: EventActions = {
  async reply() {},
  async repost() {},
  async like() {},
};

const meta = {
  title: "v1/イベント/EventActions",
  component: EventActionsStory,
  parameters: { controls: { disable: true } },
  args: {
    event: note,
    scene: scene(note),
    actions: successActions,
  },
} satisfies Meta<typeof EventActionsStory>;

export default meta;
type Story = StoryObj<typeof meta>;

export const 通常: Story = {};

export const Likeリポスト済み: Story = {
  args: {
    scene: scene(note, like, repost),
  },
};

export const 返信ダイアログ: Story = {
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByTestId("event-reply"));
    await expect(
      within(document.body).getByTestId("reply-dialog"),
    ).toBeVisible();
  },
};

export const リポスト送信中: Story = {
  args: {
    actions: {
      ...successActions,
      repost: () => new Promise(() => {}),
    },
  },
  play: async ({ canvasElement }) => {
    const button = within(canvasElement).getByTestId("event-repost");
    await userEvent.click(button);
    await expect(button).toBeDisabled();
  },
};

export const Like送信失敗: Story = {
  args: {
    actions: {
      ...successActions,
      async like() {
        throw new Error("Storybook用の送信失敗");
      },
    },
  },
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByTestId("event-like"));
    await expect(
      within(canvasElement).findByTestId("event-like-error"),
    ).resolves.toHaveTextContent("Storybook用の送信失敗");
  },
};

export const 通知ではアクションなし: Story = {
  args: {
    event: notification,
    scene: scene(note, notification),
  },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).queryByTestId("event-actions"),
    ).not.toBeInTheDocument();
  },
};
