import { GUIDES } from "@streets/core/signal/guides";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import GuidePageView from "./GuidePageView";

const meta = {
  title: "Signal/Guide URL",
  component: GuidePageView,
} satisfies Meta<typeof GuidePageView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const 通常: Story = {
  args: { guide: GUIDES[1] },
};

export const 見つからない: Story = {
  args: { guide: undefined },
};

export const 長い本文と狭い幅: Story = {
  args: {
    guide: {
      ...GUIDES[4],
      content: [GUIDES[4].content.join(" ").repeat(8)],
    },
  },
  globals: { viewport: { value: "mobile1" } },
};
