import type { NostrEvent } from "@streets/core/nostr/event";
import { commentTree } from "@streets/core/view/comment-tree";
import type { Component } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import {
  alice,
  bob,
  carol,
  profiles,
  viewer,
} from "../note/event-stories/event-story";
import { EventSceneProvider } from "../storybook/EventScene";
import ArticleCommentsView from "./ArticleCommentsView";
import { fullArticle } from "./story-articles";

const first = bob.comment(fullArticle, "記事へのコメント。読みやすかった。");
const reply = alice.comment(first, "ありがとう。", fullArticle);
const replyToReply = carol.comment(reply, "返信への返信。", fullArticle);
const second = carol.comment(fullArticle, "もう 1 件のコメント。");
let deep: NostrEvent = first;
const deepChain = Array.from({ length: 5 }, (_, index) => {
  deep = (index % 2 === 0 ? carol : bob).comment(
    deep,
    `${index + 2} 段目の返信。3 段より深くは下げない。`,
    fullArticle,
  );
  return deep;
});
const longComment = bob.comment(
  fullArticle,
  Array.from(
    { length: 14 },
    (_, index) => `${index + 1} 行目。長いコメントも投稿と同じところで畳む。`,
  ).join("\n"),
);

const Comments: Component<{
  events: NostrEvent[];
  settled: boolean;
  width: number;
}> = (props) => (
  <EventSceneProvider
    scene={{ events: [...profiles, fullArticle, ...props.events], viewer }}
  >
    <div style={{ width: `${props.width}px` }}>
      <ArticleCommentsView
        rows={commentTree(props.events)}
        settled={props.settled}
        size="normal"
        expandMedia
      />
    </div>
  </EventSceneProvider>
);

const meta = {
  title: "長文記事/コメント",
  component: Comments,
  args: { settled: true, width: 420 },
  argTypes: { events: { control: false } },
} satisfies Meta<typeof Comments>;

export default meta;
type Story = StoryObj<typeof meta>;

/** 記事への直接のコメントを古い順に並べ、返信は段を下げてその下に入れる。 */
export const 通常: Story = {
  args: { events: [first, reply, replyToReply, second] },
};

export const 深い返信: Story = { args: { events: [first, ...deepChain] } };

export const 長い本文: Story = { args: { events: [longComment, first] } };

export const まだ無い: Story = { args: { events: [] } };

export const 取得中: Story = { args: { events: [], settled: false } };

export const 狭いカラム: Story = {
  args: { events: [first, ...deepChain], width: 280 },
};
