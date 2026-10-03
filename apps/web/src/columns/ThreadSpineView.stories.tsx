import type { NostrEvent } from "@streets/core/nostr/event";
import { threadSpine } from "@streets/core/view/thread-spine";
import type { Component } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { fullArticle } from "../article/story-articles";
import avatarUrl from "../storybook/avatar-fixture.svg";
import { type EventScene, EventSceneProvider } from "../storybook/EventScene";
import { createStoryAuthor } from "../storybook/story-events";
import ThreadSpineView from "./ThreadSpineView";

const alice = createStoryAuthor(11, {
  name: "alice",
  displayName: "あいもの",
  picture: avatarUrl,
});
const bob = createStoryAuthor(22, { name: "bob", displayName: "ほかのひと" });
const carol = createStoryAuthor(33, { name: "carol" });
const viewer = createStoryAuthor(55, { name: "me", displayName: "わたし" });
const profiles = [
  alice.profile(),
  bob.profile(),
  carol.profile(),
  viewer.profile(),
];

const long = (label: string) =>
  `${label}\n${Array.from(
    { length: 12 },
    (_, index) =>
      `${index + 1} 行目。長い投稿でも、アイコンの縦線が途切れず、前後の投稿と繋がって見えるかを確かめる。`,
  ).join("\n")}`;

const root = alice.note("スレッドの根。ここから会話が始まる。");
const middle = bob.reply(
  root,
  "根への返信。ここが中間で、線は上にも下にも伸びる。",
);
const focus = carol.reply(
  middle,
  "いま開いている投稿。ここだけ normal で出す。",
);
const longMiddle = bob.reply(root, long("長い中間の投稿。"));
const longFocus = carol.reply(longMiddle, long("長い焦点の投稿。"));
const replies = [
  alice.reply(focus, "短い返信。"),
  bob.reply(focus, long("とても長い返信。")),
  carol.reply(focus, "もう 1 件の返信。"),
];
const longReplies = [
  alice.reply(longFocus, long("長い焦点への、長い返信。")),
  bob.reply(longFocus, "短い返信。"),
];

// Amethyst などは、kind:1 の起点への返信をコメント（kind:1111）で書く。
const commentOnRoot = bob.comment(
  root,
  "起点への返信を、コメントで書いたもの。",
);
const commentFocus = carol.comment(
  commentOnRoot,
  "コメントへの返信。根は大文字の E にだけある。",
  root,
);
const mixedReplies = [
  alice.comment(commentFocus, "コメントでの返信。", root),
  bob.comment(commentFocus, "もう 1 件のコメント。", root),
];

type Props = {
  events: NostrEvent[];
  focusId: string;
  settled: boolean;
  expandMedia: boolean;
};

const ThreadStory: Component<Props> = (props) => {
  const scene = (): EventScene => ({
    events: [...profiles, ...props.events],
    viewer,
  });
  return (
    <EventSceneProvider scene={scene()}>
      {/* カラムと同じ幅・同じ縦スクロールに載せる（アイコンの sticky を確かめる）。 */}
      <div class="h-[600px] w-[360px] overflow-y-auto border border-primary">
        <ThreadSpineView
          spine={threadSpine(props.events, props.focusId)}
          settled={props.settled}
          expandMedia={props.expandMedia}
        />
      </div>
    </EventSceneProvider>
  );
};

const meta = {
  title: "カラム/スレッド",
  component: ThreadStory,
  args: { settled: true, expandMedia: true },
  argTypes: { events: { control: false }, focusId: { control: false } },
} satisfies Meta<typeof ThreadStory>;

export default meta;
type Story = StoryObj<typeof meta>;

export const 通常: Story = {
  args: {
    events: [root, middle, focus, ...replies],
    focusId: focus.id,
  },
};

export const 根を開いている: Story = {
  args: { events: [root, middle, focus], focusId: root.id },
};

export const 根まで辿れない: Story = {
  args: { events: [middle, focus], focusId: focus.id },
};

export const 取得中: Story = {
  args: { events: [middle, focus], focusId: focus.id, settled: false },
};

// `root` の印を付けず、返信先を `reply` の印だけで指すクライアントがある。
const bareRoot = bob.note("印を付けないクライアントの投稿。");
const bareMiddle = alice.note("返信先を reply の印だけで指す返信。", [
  ["e", bareRoot.id, "", "reply"],
  ["p", bob.pubkey],
]);
const bareFocus = bob.note("その返信への、また reply の印だけの返信。", [
  ["e", bareMiddle.id, "", "reply"],
  ["p", alice.pubkey],
]);

/** `root` の印が無い返信でも、返信先をたどって根まで並べる。 */
export const root_の印が無い: Story = {
  args: { events: [bareRoot, bareMiddle, bareFocus], focusId: bareFocus.id },
};

/** 欠けた返信先を取りに行っている間。取り終えるまで「取得できませんでした」と言わない。 */
export const 上の方を取得中: Story = {
  args: {
    events: [bareMiddle, bareFocus],
    focusId: bareFocus.id,
    settled: false,
  },
};

export const 長い投稿が混ざる: Story = {
  args: {
    events: [root, longMiddle, longFocus, ...longReplies],
    focusId: longFocus.id,
  },
};

export const 返信がない: Story = {
  args: { events: [root, middle, focus], focusId: focus.id },
};

/** 投稿とコメントが混ざったスレッド。返信と同じ線でつなぐ。 */
export const コメントが混ざる: Story = {
  args: {
    events: [root, commentOnRoot, commentFocus, middle, ...mixedReplies],
    focusId: commentFocus.id,
  },
};

const articleComment = bob.comment(fullArticle, "記事へのコメント。");
const articleReply = carol.comment(
  articleComment,
  "記事へのコメントへの返信。",
  fullArticle,
);

/** 記事へのコメントのスレッドは、コメントが付いた記事を一番上に添える。 */
export const 記事へのコメント: Story = {
  args: {
    events: [fullArticle, articleComment, articleReply],
    focusId: articleReply.id,
  },
};

export const 記事を取得中: Story = {
  args: { events: [articleComment, articleReply], focusId: articleReply.id },
};
