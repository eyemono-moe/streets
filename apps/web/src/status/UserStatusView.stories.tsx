import type { UserStatus } from "@streets/core/nostr/user-status";
import type { Component } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import emojiUrl from "../storybook/emoji-fixture.svg";
import { UserStatusLine, UserStatusPills } from "./UserStatusView";

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
    "とても長いステータスで、名刺やプロフィールでは折り返し、投稿の下では 1 行で切れる。".repeat(
      3,
    ),
  link: { type: "event", id: "a".repeat(64) },
  expiresAt: undefined,
  tags: [],
};

const Both: Component<{ statuses: UserStatus[] }> = (props) => (
  <div class="flex w-[344px] flex-col gap-4">
    <section class="flex flex-col gap-1">
      <h3 class="c-secondary text-caption">プロフィール・名刺</h3>
      <UserStatusPills statuses={props.statuses} />
    </section>
    <section class="flex flex-col gap-1">
      <h3 class="c-secondary text-caption">投稿の名前の下</h3>
      <div class="pt-1">
        <UserStatusLine statuses={props.statuses} />
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

/** 聴いている曲。リンクがあれば新しいタブで開ける。 */
export const 聴いている曲: Story = { args: { statuses: [music] } };

/** 両方あるとき、投稿の下では 1 行に並べる。 */
export const 両方: Story = { args: { statuses: [general, music] } };

export const 長いステータス: Story = { args: { statuses: [long, music] } };
