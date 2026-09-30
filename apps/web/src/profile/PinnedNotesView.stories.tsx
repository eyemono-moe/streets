import type { Component } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import type { EventSize } from "../note/Event";
import { alice, profiles } from "../note/event-stories/event-story";
import { EventSceneProvider } from "../storybook/EventScene";
import PinnedNotesView from "./PinnedNotesView";

const first = alice.note("自己紹介です。Nostr でクライアントを作っています。");
const second = alice.note(
  "いちばん読んでほしい投稿。長めに書いたので、ピン留めしておく。".repeat(4),
);
const missingId = "f".repeat(64);

type Props = { ids: string[]; size: EventSize };

const PinnedStory: Component<Props> = (props) => (
  <EventSceneProvider
    scene={{
      events: [...profiles, first, second],
      missingIds: [missingId],
    }}
  >
    <div class="w-[360px]">
      <PinnedNotesView ids={props.ids} size={props.size} />
    </div>
  </EventSceneProvider>
);

const meta = {
  title: "ユーザー/ピン留めした投稿",
  component: PinnedStory,
  args: { size: "normal" },
} satisfies Meta<typeof PinnedStory>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ひとつ: Story = { args: { ids: [first.id] } };

export const ふたつ: Story = { args: { ids: [second.id, first.id] } };

export const コンパクト: Story = {
  args: { ids: [second.id, first.id], size: "compact" },
};

/** 消された投稿をピン留めしたままのとき。 */
export const 読み込めない: Story = { args: { ids: [missingId, first.id] } };
