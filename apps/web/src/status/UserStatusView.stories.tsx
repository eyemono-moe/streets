import type { UserStatus } from "@streets/core/nostr/user-status";
import type { Component } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import emojiUrl from "../storybook/emoji-fixture.svg";
import { StatusBadgeView, UserStatusBubble } from "./UserStatusView";

const general: UserStatus = {
  type: "general",
  content: "作業配信したりしたい :party:",
  link: undefined,
  expiresAt: undefined,
  tags: [["emoji", "party", emojiUrl]],
};
const music: UserStatus = {
  type: "music",
  content: "Black Dog / Led Zeppelin",
  link: { type: "url", url: "https://songwhip.com/led-zeppelin/black-dog" },
  expiresAt: undefined,
  tags: [],
};
const long: UserStatus = {
  type: "general",
  content:
    "とても長いステータスで、プロフィールと名刺の吹き出しでは、幅いっぱいで折り返して全部読める。".repeat(
      3,
    ),
  link: { type: "event", id: "a".repeat(64) },
  expiresAt: undefined,
  tags: [],
};

const longMusic: UserStatus = {
  type: "music",
  content:
    "夜のギター（Live at 下北沢 2026 アコースティック・セッション） / kai & the midnight band",
  link: { type: "url", url: "https://example.com/track" },
  expiresAt: undefined,
  tags: [],
};

const Both: Component<{ statuses: UserStatus[]; width?: number }> = (props) => (
  <div class="flex flex-col gap-4" style={{ width: `${props.width ?? 344}px` }}>
    <section class="flex flex-col gap-1">
      <h3 class="c-secondary text-caption">プロフィール・名刺</h3>
      {/* アイコンの代わりの枠。吹き出しの三角がその真下に来る。 */}
      <div class="size-20 rounded-3 bg-tertiary" />
      <UserStatusBubble
        statuses={props.statuses}
        arrowLeft={34}
        class="-mt-1"
      />
    </section>
    <section class="flex flex-col gap-1">
      <h3 class="c-secondary text-caption">投稿のアイコンの印</h3>
      <div class="relative size-10 rounded-2 bg-tertiary">
        <div class="absolute -right-0.5 top-[33px]">
          <StatusBadgeView
            general={props.statuses.some((status) => status.type === "general")}
            music={props.statuses.some((status) => status.type === "music")}
          />
        </div>
      </div>
    </section>
  </div>
);

const meta = {
  title: "ユーザー/ステータス",
  component: Both,
} satisfies Meta<typeof Both>;

export default meta;
type Story = StoryObj<typeof meta>;

export const いまの状態: Story = { args: { statuses: [general] } };

/** 聴いている曲だけ。リンクがあれば新しいタブで開ける。 */
export const 聴いている曲: Story = { args: { statuses: [music] } };

/** 両方あるとき。 */
export const 両方: Story = { args: { statuses: [general, music] } };

export const 長いステータス: Story = { args: { statuses: [long, music] } };

/** 曲名が 1 行に収まらないときは流す。触れている間は止まる。 */
export const 長い曲名: Story = { args: { statuses: [general, longMusic] } };

/** いまの状態が無く、曲だけのとき。同じ吹き出しに曲だけを出す。 */
export const 長い曲名だけ: Story = { args: { statuses: [longMusic] } };

export const 狭い幅: Story = {
  args: { statuses: [general, longMusic], width: 220 },
};
