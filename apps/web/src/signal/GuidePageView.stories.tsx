import { type Guide, GUIDES } from "@streets/core/signal/guides";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { Mediates } from "../ui-events";
import GuidePageView from "./GuidePageView";

const meta = {
  title: "Signal/Guide URL",
  component: (props: { guide?: Guide }) => (
    <Mediates handle={() => true}>
      <GuidePageView {...props} />
    </Mediates>
  ),
} satisfies Meta<typeof GuidePageView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const 通常: Story = {
  args: { guide: GUIDES[1] },
};

export const 操作リンクを含む案内: Story = {
  args: { guide: GUIDES[4] },
};

export const 見つからない: Story = {
  args: { guide: undefined },
};

export const 長い本文と狭い幅: Story = {
  args: {
    guide: {
      ...GUIDES[4],
      content: [
        [
          GUIDES[4].content
            .flat()
            .map((part) => (typeof part === "string" ? part : part.label))
            .join(" ")
            .repeat(8),
        ],
      ],
    },
  },
  globals: { viewport: { value: "mobile1" } },
};
