import {
  type ZapFlowEvent,
  type ZapFlowState,
  closedZapFlow,
  zapFlowTransition,
} from "@streets/core/zap/zap-flow";
import { createSignal } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { EventSceneProvider } from "../storybook/EventScene";
import { createStoryAuthor } from "../storybook/story-events";
import { Mediates } from "../ui-events";
import ZapDialog from "./ZapDialog";

const alice = createStoryAuthor(11, { name: "alice", displayName: "ありす" });
const note = alice.note("Zap を受け取れる人の投稿です。いつもありがとう。");
// BOLT-11 の仕様書の例（100 sats）。支払いには使えない。
const INVOICE =
  "lnbc1u1pvjluezpp5qqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqypqdq5xysxxatsyp3k7enxv4jsxqzpuaztrnwngzn3kdzw5hydlzf03qdgm2hdq27cqv3agm2awhz5se903vruatfhq77w3ls4evs3ch9zw97j25emudupq63nyw24cg27h2rspfj9srp";

type Args = { events: ZapFlowEvent[] };

const Story = (props: Args) => {
  const [state, setState] = createSignal<ZapFlowState>(
    props.events.reduce(zapFlowTransition, closedZapFlow()),
  );
  return (
    <EventSceneProvider scene={{ events: [alice.profile(), note] }}>
      <Mediates
        handle={(event) => {
          if (!event.type.startsWith("zap/")) return false;
          setState((current) =>
            zapFlowTransition(current, event as ZapFlowEvent),
          );
          return true;
        }}
      >
        <ZapDialog state={state()} />
      </Mediates>
    </EventSceneProvider>
  );
};

const open: ZapFlowEvent = { type: "zap/open", target: note };

const meta = {
  title: "Zap/Zap する",
  component: Story,
  args: { events: [open] },
  argTypes: { events: { control: false } },
  globals: { viewport: { value: "responsive", isRotated: false } },
} satisfies Meta<Args>;

export default meta;
type S = StoryObj<typeof meta>;

export const 金額を選ぶ: S = {};
export const 一言つき: S = {
  args: {
    events: [
      open,
      { type: "zap/amount", amount: 1000 },
      { type: "zap/message", value: "いつも楽しく読んでいます！" },
    ],
  },
};
export const ほかの金額: S = {
  args: { events: [open, { type: "zap/custom-amount", value: "2,100" }] },
};
export const 金額が読めない: S = {
  args: { events: [open, { type: "zap/custom-amount", value: "abc" }] },
};
export const 請求書をもらっている: S = {
  args: { events: [open, { type: "zap/submit" }] },
};
export const ブラウザのウォレットで払う: S = {
  args: {
    events: [
      open,
      { type: "zap/submit" },
      { type: "zap/invoice", invoice: INVOICE, wallet: "webln" },
    ],
  },
};
export const QRで払う: S = {
  args: {
    events: [
      open,
      { type: "zap/submit" },
      { type: "zap/invoice", invoice: INVOICE, wallet: "manual" },
    ],
  },
};
export const 幅の狭い画面: S = {
  args: { events: [open] },
  globals: { viewport: { value: "mobile1", isRotated: false } },
};
