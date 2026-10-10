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
    listAvailable: true,
    zappable: true,
    onZap: () => {},
    onMute: () => {},
    onOpenRelays: () => {},
    onAddToList: () => {},
  },
} satisfies Meta<typeof ProfileMenuView>;

export default meta;
type S = StoryObj<typeof meta>;

export const 他のユーザー: S = {};
export const ミュート中: S = { args: { muted: true } };
export const Zapを受け取れない人: S = { args: { zappable: false } };
export const 自分: S = { args: { mine: true } };
export const ログインしていない: S = {
  args: { muteAvailable: false, listAvailable: false },
};
export const 狭い画面: S = {
  parameters: { viewport: { defaultViewport: "mobile1" } },
};
