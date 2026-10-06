import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { EventSceneProvider } from "../storybook/EventScene";
import Event, { type EventSize } from "./Event";
import { alice, plain, viewer } from "./event-stories/event-story";
import MutedGate from "./MutedGate";

/** 「畳む」にしたカラムの 1 行。押すと中身を出す。 */
const meta = {
  title: "イベント/ミュートを畳んだ行",
  component: (props: { size: EventSize; muted: boolean }) => (
    <EventSceneProvider
      scene={{
        events: [plain],
        viewer,
        mutes: props.muted
          ? [
              {
                target: { type: "pubkey", value: alice.pubkey },
                visibility: "private",
              },
            ]
          : [],
      }}
    >
      <div class="w-90">
        <MutedGate event={plain} size={props.size}>
          <Event event={plain} size={props.size} />
        </MutedGate>
      </div>
    </EventSceneProvider>
  ),
  args: { size: "normal", muted: true },
  argTypes: {
    size: { control: "inline-radio", options: ["normal", "compact"] },
  },
} satisfies Meta<{ size: EventSize; muted: boolean }>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ゆったり: Story = {};

export const 高密度: Story = { args: { size: "compact" } };

/** ミュートに当たらなければ、そのまま出す。 */
export const 当たらないとき: Story = { args: { muted: false } };
