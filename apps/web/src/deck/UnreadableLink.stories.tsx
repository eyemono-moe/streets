import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { Mediates } from "../ui-events";
import UnreadableLink from "./UnreadableLink";

const meta = {
  title: "デッキ/読めなかったリンク",
  component: UnreadableLink,
  decorators: [
    (Story) => (
      <Mediates handle={() => true}>
        <div class="h-60 w-95 bg-primary">
          <Story />
        </div>
      </Mediates>
    ),
  ],
} satisfies Meta<typeof UnreadableLink>;

export default meta;
type Story = StoryObj<typeof meta>;

/** 古い版の投稿画面のパス。 */
export const 古い版のパス: Story = { args: { entity: "post" } };

/** 長くて切れ目の無い文字列も、カラムの幅で折り返す。 */
export const 長い文字列: Story = {
  args: {
    entity:
      "note1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq",
  },
};

export const 狭いカラム: Story = {
  args: { entity: "post" },
  parameters: { viewport: { defaultViewport: "column320" } },
};
