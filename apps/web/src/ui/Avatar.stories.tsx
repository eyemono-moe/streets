import type { Meta, StoryObj } from "storybook-solidjs-vite";
import avatarUrl from "../storybook/avatar-fixture.svg";
import Avatar from "./Avatar";

const PUBKEY = "a".repeat(64);

const meta = {
  title: "UI/Avatar",
  component: Avatar,
  args: {
    pubkey: PUBKEY,
    class: "size-16 rounded-3",
  },
  argTypes: {
    pubkey: { control: "text" },
    picture: { control: "text" },
  },
} satisfies Meta<typeof Avatar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const プロフィール画像あり: Story = {
  args: { picture: avatarUrl },
};

export const プロフィール未取得: Story = {};

export const 画像を読み込めない: Story = {
  args: { picture: "/存在しないプロフィール画像.png" },
};

export const 各サイズ: Story = {
  render: () => (
    <div class="flex items-end gap-4">
      <Avatar pubkey={PUBKEY} class="size-20 rounded-3" />
      <Avatar pubkey={PUBKEY} class="size-14 rounded-2" />
      <Avatar pubkey={PUBKEY} class="size-10 rounded-2" />
      <Avatar pubkey={PUBKEY} class="size-8 rounded-2" />
      <Avatar pubkey={PUBKEY} class="size-5 rounded-1.5" />
    </div>
  ),
};
