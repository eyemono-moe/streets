import type { NostrEvent } from "@streets/core/nostr/event";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import type { EventSize } from "../note/Event";
import { EventSceneProvider } from "../storybook/EventScene";
import { createStoryAuthor } from "../storybook/story-events";
import ZapNotice from "./ZapNotice";

const me = createStoryAuthor(11, { name: "me", displayName: "わたし" });
const bob = createStoryAuthor(22, { name: "bob", displayName: "ぼぶ" });
// 受け取り先のサーバー。受領（kind:9735）に署名する。
const server = createStoryAuthor(33, { name: "wallet" });
const mine = me.note("Zap の通知を作りました。");

// 金額の部分だけを読むので、後ろは仕様書の例を縮めたもの。
const invoiceFor = (sats: number) =>
  `lnbc${sats * 10}n1pvjluezpp5qqqsyqcyq5rqwzqfqqq`;

const receipt = (options: {
  sats: number;
  message?: string;
  target?: NostrEvent;
  sender?: ReturnType<typeof createStoryAuthor>;
}) => {
  const sender = options.sender ?? bob;
  const request = sender.event({
    kind: 9734,
    content: options.message ?? "",
    tags: [
      ["relays", "wss://relay.example/"],
      ["amount", String(options.sats * 1000)],
      ["p", me.pubkey],
      ...(options.target ? [["e", options.target.id]] : []),
    ],
  });
  return server.event({
    kind: 9735,
    content: "",
    tags: [
      ["p", me.pubkey],
      ...(options.target ? [["e", options.target.id]] : []),
      ["bolt11", invoiceFor(options.sats)],
      ["description", JSON.stringify(request)],
    ],
  });
};

type Args = { receipt: NostrEvent; size: EventSize; width: number };

const meta = {
  title: "Zap/通知",
  component: (props: Args) => (
    <EventSceneProvider
      scene={{ events: [me.profile(), bob.profile(), mine, props.receipt] }}
    >
      <div class="bg-primary" style={{ width: `${props.width}px` }}>
        <ZapNotice receipt={props.receipt} size={props.size} />
      </div>
    </EventSceneProvider>
  ),
  args: {
    receipt: receipt({
      sats: 1000,
      message: "いつも楽しく読んでいます！",
      target: mine,
    }),
    size: "normal",
    width: 380,
  },
  argTypes: {
    size: { control: "inline-radio", options: ["normal", "compact"] },
    receipt: { control: false },
  },
} satisfies Meta<Args>;

export default meta;
type S = StoryObj<typeof meta>;

export const 一言つき: S = {};
export const 一言なし: S = {
  args: { receipt: receipt({ sats: 100, target: mine }) },
};
export const 表示密度コンパクト: S = { args: { size: "compact" } };
export const プロフィールへのZap: S = {
  args: { receipt: receipt({ sats: 21_000, message: "応援しています" }) },
};
export const 長い一言: S = {
  args: {
    receipt: receipt({
      sats: 500,
      message: "とても長い一言。".repeat(20),
      target: mine,
    }),
  },
};
export const 幅の狭いカラム: S = { args: { width: 300 } };
