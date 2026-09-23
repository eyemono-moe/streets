import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { ProfileMenuView } from "./ProfileMenu";

const meta = {
  title: "ユーザー/詳細メニュー",
  component: ProfileMenuView,
  args: {
    open: true,
    mine: false,
    muted: false,
    muteAvailable: true,
    onMute: () => {},
    onOpenRelays: () => {},
  },
} satisfies Meta<typeof ProfileMenuView>;

export default meta;
type S = StoryObj<typeof meta>;

export const 他のユーザー: S = {};
export const ミュート中: S = { args: { muted: true } };
export const 自分: S = { args: { mine: true } };
export const ログインしていない: S = { args: { muteAvailable: false } };
export const 狭い画面: S = {
  parameters: { viewport: { defaultViewport: "mobile1" } },
};
