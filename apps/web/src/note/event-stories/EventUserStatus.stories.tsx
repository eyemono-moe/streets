import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { EventStory, alice, eventStoryMeta, plain, scene } from "./event-story";

const general = alice.event({
  kind: 30_315,
  content: "作業中",
  tags: [["d", "general"]],
});
const music = alice.event({
  kind: 30_315,
  content: "夜に駆ける / YOASOBI",
  tags: [
    ["d", "music"],
    ["r", "https://example.com/song"],
  ],
});
const presence = alice.event({
  kind: 30_315,
  content: '{"lastSeen":1790790386192}',
  tags: [["d", "presence"]],
});

const meta = {
  ...eventStoryMeta,
  title: "イベント/投稿/ステータス",
} satisfies Meta<typeof EventStory>;

export default meta;
type Story = StoryObj<typeof meta>;

/** 書いた人のステータスを、名前の下に 1 行で出す。 */
export const ステータスがある人: Story = {
  args: { event: plain, scene: scene(plain, general, music) },
};

/** 高密度では出さない。 */
export const コンパクト: Story = {
  args: { event: plain, scene: scene(plain, general, music), size: "compact" },
};

/** general・music 以外（アプリが置く機械向けの値）は出さない。 */
export const 出さない種類だけ: Story = {
  args: { event: plain, scene: scene(plain, presence) },
};
