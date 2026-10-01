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

type Props = { ids: string[]; settled: boolean; size: EventSize };

const PinnedStory: Component<Props> = (props) => (
  <EventSceneProvider
    scene={{
      events: [...profiles, first, second],
      missingIds: [missingId],
    }}
  >
    <div class="w-[360px]">
      <PinnedNotesView
        ids={props.ids}
        settled={props.settled}
        size={props.size}
      />
    </div>
  </EventSceneProvider>
);

const meta = {
  title: "ユーザー/ピン留めのタブ",
  component: PinnedStory,
  args: { size: "normal", settled: true },
} satisfies Meta<typeof PinnedStory>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ひとつ: Story = { args: { ids: [first.id] } };

/** 後からピン留めしたものが上。 */
export const ふたつ: Story = { args: { ids: [second.id, first.id] } };

export const コンパクト: Story = {
  args: { ids: [second.id, first.id], size: "compact" },
};

/** Nostr のピン留めはいくつでも付けられる。タブに分けたので、投稿の一覧は崩れない。 */
export const たくさん: Story = {
  args: { ids: [second.id, first.id, second.id, first.id, second.id] },
};

/** 消された投稿をピン留めしたままのとき。 */
export const 読み込めない: Story = { args: { ids: [missingId, first.id] } };

export const ピン留めが無い: Story = { args: { ids: [] } };

/** 一覧を取り終える前は「ありません」と言わない。 */
export const 読み込み中: Story = { args: { ids: [], settled: false } };
