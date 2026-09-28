import type { NostrEvent } from "@streets/core/nostr/event";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { EventStory, alice, eventStoryMeta, scene } from "./event-story";

const unknown = alice.event({ kind: 30023, tags: [], content: "# 長文記事" });

const meta = {
  ...eventStoryMeta,
  title: "イベント/描けないもの",
} satisfies Meta<typeof EventStory>;

export default meta;
type Story = StoryObj<typeof meta>;

export const 未対応のkind: Story = {
  args: { event: unknown, scene: scene(unknown) },
};

/**
 * 形の崩れたイベント（リレーから来るものは形を保証されない）。描画の途中で投げても、
 * この 1 件だけを「表示できませんでした」に置き換え、周りは描き続ける。
 */
export const 描けないイベント: Story = {
  args: {
    event: { ...unknown, kind: 1, tags: null } as unknown as NostrEvent,
    scene: scene(),
  },
};
