import { createRelayTraffic } from "@streets/core/relay/relay-traffic";
import { onCleanup } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { RelayTrafficProvider } from "../relay-traffic";
import { EventSceneProvider } from "../storybook/EventScene";
import StatsSettings from "./StatsSettings";

const RELAYS = ["wss://relay.damus.io/", "wss://nos.lol/", "wss://yabu.me/"];
const KINDS = [1, 1, 1, 7, 7, 0, 6];

/** リレーから受け取り続けているところ。数えた値がページの更新のたびに増える。 */
const Story = (props: { width: number }) => {
  const traffic = createRelayTraffic();
  for (const url of RELAYS) {
    traffic.recorder.attempted(url);
    traffic.recorder.opened(url);
    traffic.recorder.subscriptions(url, 6);
  }
  let next = 0;
  const timer = setInterval(() => {
    for (const [index, url] of RELAYS.entries()) {
      for (let count = 0; count < 3 - index; count++) {
        const id = `story-${next++ % 40}`;
        const kind = KINDS[next % KINDS.length];
        traffic.recorder.received(url, "EVENT", 800);
        traffic.recorder.event(url, undefined, id, kind, 800);
      }
    }
  }, 300);
  onCleanup(() => clearInterval(timer));

  return (
    <EventSceneProvider scene={{ events: [] }}>
      <RelayTrafficProvider value={traffic}>
        <div class="bg-primary p-6" style={{ width: `${props.width}px` }}>
          <StatsSettings />
        </div>
      </RelayTrafficProvider>
    </EventSceneProvider>
  );
};

const meta = {
  title: "設定/統計のページ",
  component: Story,
  args: { width: 660 },
} satisfies Meta<{ width: number }>;

export default meta;
type S = StoryObj<typeof meta>;

/** 数えた値が増え続ける。リレーの内訳を開いたまま、更新されても閉じない。 */
export const 受け取り続けている: S = {};
