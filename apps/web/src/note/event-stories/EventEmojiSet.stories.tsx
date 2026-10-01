import type { NostrEvent } from "@streets/core/nostr/event";
import type { Component } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { CustomEmojisMediator } from "../../emoji/custom-emojis";
import emojiUrl from "../../storybook/emoji-fixture.svg";
import { EventSceneProvider } from "../../storybook/EventScene";
import Event, { type EventSize } from "../Event";
import { alice, bob, profiles, viewer } from "./event-story";

const emojiSet = (
  identifier: string,
  title: string | undefined,
  count: number,
) =>
  bob.event({
    kind: 30_030,
    content: "",
    tags: [
      ["d", identifier],
      ...(title ? [["title", title]] : []),
      ...Array.from({ length: count }, (_, i) => [
        "emoji",
        `neko${i + 1}`,
        emojiUrl,
      ]),
    ],
  });

const cats = emojiSet("neko", "ねこスタンプ", 8);
const many = emojiSet("many", "たくさん入ったセット", 40);
const empty = emojiSet("empty", "空っぽのセット", 0);
const longTitle = emojiSet(
  "long",
  "とても長い名前がついた絵文字セットで、狭いカラムでは折り返して読める".repeat(
    2,
  ),
  5,
);
const quote = alice.quote(cats, "このセットかわいい。");

type Props = {
  event: NostrEvent;
  events?: NostrEvent[];
  size: EventSize;
  /** もう自分の絵文字リストに入っている。 */
  added?: boolean;
};

/** 自分の絵文字リストの段をつなぎ、「加える」を押せる状態で見る。書き込みはしない。 */
const EmojiSetStory: Component<Props> = (props) => {
  const list = viewer.event({
    kind: 10_030,
    content: "",
    tags: props.added ? [["a", `30030:${bob.pubkey}:neko`]] : [],
  });
  return (
    <EventSceneProvider
      scene={{
        events: [...profiles, props.event, ...(props.events ?? [])],
        viewer,
      }}
    >
      <CustomEmojisMediator
        writer={{ replace: () => new Promise(() => {}) }}
        list={() => list}
        fetchLatest={() => Promise.resolve(undefined)}
      >
        <div class="w-[360px]">
          <Event event={props.event} size={props.size} />
        </div>
      </CustomEmojisMediator>
    </EventSceneProvider>
  );
};

const meta = {
  title: "イベント/絵文字セット",
  component: EmojiSetStory,
  args: { size: "normal" },
} satisfies Meta<typeof EmojiSetStory>;

export default meta;
type Story = StoryObj<typeof meta>;

export const まだ入れていない: Story = { args: { event: cats } };

export const 入れた後: Story = { args: { event: cats, added: true } };

/** 多いときは先頭だけ出し、「ほか N 個」で残りを広げる。 */
export const たくさん入っている: Story = { args: { event: many } };

export const 空っぽ: Story = { args: { event: empty } };

export const 長い名前: Story = { args: { event: longTitle } };

/** 引用の中からは加えさせない。 */
export const 引用されたセット: Story = {
  args: { event: quote, events: [cats] },
};

export const コンパクト: Story = { args: { event: cats, size: "compact" } };
