import { TIMELINE_KINDS } from "@streets/core/deck/column-kinds";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { EventSceneProvider } from "../storybook/EventScene";
import { Mediates } from "../ui-events";
import PoppedOutColumn from "./PoppedOutColumn";

const meta = {
  title: "デッキ/ピクチャーインピクチャーに出したカラム",
  component: PoppedOutColumn,
  decorators: [
    (Story) => (
      <EventSceneProvider scene={{ events: [] }}>
        <Mediates handle={() => true}>
          <div class="h-120 w-95 border-primary border-x">
            <Story />
          </div>
        </Mediates>
      </EventSceneProvider>
    ),
  ],
} satisfies Meta<typeof PoppedOutColumn>;

export default meta;
type Story = StoryObj<typeof meta>;

/** デッキに残る置き場。見出しのボタンも「デッキに戻す」に替わる。 */
export const デッキの置き場: Story = {
  args: {
    column: {
      id: "home",
      title: "ホーム",
      source: { kind: "followees", kinds: [...TIMELINE_KINDS] },
    },
    grip: true,
  },
};

export const 長い題名: Story = {
  args: {
    column: {
      id: "tag",
      title: "とても長いハッシュタグのカラムの題名がカラムの幅に入りきらない",
      source: { kind: "literal", filters: [{ "#t": ["nostr"] }] },
    },
  },
};

export const 狭いカラム: Story = {
  args: {
    column: {
      id: "home",
      title: "ホーム",
      source: { kind: "followees", kinds: [...TIMELINE_KINDS] },
    },
  },
  parameters: { viewport: { defaultViewport: "column320" } },
};
