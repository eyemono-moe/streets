import { buildUserStatus } from "@streets/core/nostr/build/user-status";
import { USER_STATUS_KIND } from "@streets/core/nostr/user-status";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { EventStory, alice, eventStoryMeta, plain, scene } from "./event-story";

const general = alice.event(buildUserStatus({ content: "作業中 ☕" }));
const music = alice.event({
  kind: USER_STATUS_KIND,
  tags: [["d", "music"]],
  content: "Black Dog / Led Zeppelin",
});

const meta = {
  ...eventStoryMeta,
  title: "イベント/投稿/ステータスの印",
} satisfies Meta<typeof EventStory>;

export default meta;
type Story = StoryObj<typeof meta>;

/** いまの状態がある人。アイコンの右下に「…」の吹き出しを添える。 */
export const ステータス: Story = {
  args: { event: plain, scene: scene(plain, general) },
};

/** 曲を聴いている人。音の波が揺れる（動きを減らす設定では止まる）。 */
export const 曲だけ: Story = {
  args: { event: plain, scene: scene(plain, music) },
};

export const 両方: Story = {
  args: { event: plain, scene: scene(plain, general, music) },
};

/** 高密度のカラムでは、印を出さない。 */
export const 高密度: Story = {
  args: { event: plain, scene: scene(plain, general, music), size: "compact" },
};

export const ステータスが無い: Story = {
  args: { event: plain, scene: scene(plain) },
};
