import type { Meta, StoryObj } from "storybook-solidjs-vite";
import {
  EventStory,
  alice,
  bob,
  carol,
  eventStoryMeta,
  plain,
  scene,
} from "./event-story";

const reply = alice.reply(plain, "返信の本文。");
const quoted = bob.note("引用されたノートの本文。");
const quote = alice.quote(quoted, "引用つきのノート。");
const quoteOfQuote = carol.quote(
  quote,
  "引用の引用。中の引用は取りにいかない。",
);

const meta = {
  ...eventStoryMeta,
  title: "イベント/投稿/返信・引用",
} satisfies Meta<typeof EventStory>;

export default meta;
type Story = StoryObj<typeof meta>;

export const 返信: Story = { args: { event: reply, scene: scene(reply) } };

/** タイムラインでは、返信先を 1 件だけ線でつないで上に出す。 */
export const 返信先つき: Story = {
  args: { event: reply, scene: scene(reply, plain), replyContext: true },
};

/** 返信先がまだ手元に無いとき。連鎖して取りにいかないので、ここで止まる。 */
export const 返信先が見つからない: Story = {
  args: { event: reply, scene: scene(reply), replyContext: true },
};

export const 引用: Story = {
  args: { event: quote, scene: scene(quote, quoted) },
};

export const 引用の引用: Story = {
  args: {
    event: quoteOfQuote,
    scene: scene(quoteOfQuote, quote, quoted),
  },
};

export const 引用元が見つからない: Story = {
  args: {
    event: quote,
    scene: { ...scene(quote), missingIds: [quoted.id] },
  },
};
