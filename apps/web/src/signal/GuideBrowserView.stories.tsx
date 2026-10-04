import { GUIDE_CATEGORIES } from "@streets/core/signal/guides";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import GuideBrowserView from "./GuideBrowserView";

const meta = {
  title: "Signal/案内を探す",
  component: GuideBrowserView,
} satisfies Meta<typeof GuideBrowserView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const カテゴリ一覧: Story = { args: {} };

export const ログインの案内: Story = {
  args: { category: GUIDE_CATEGORIES[0] },
};

export const 狭い画面: Story = {
  args: {},
  globals: { viewport: { value: "mobile1", isRotated: false } },
};
