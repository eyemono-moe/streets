import type { LinkCardMode } from "@streets/core/deck/deck";
import { addBookmark } from "@streets/core/nostr/build/bookmark";
import {
  type ReactionInput,
  buildReaction,
} from "@streets/core/nostr/build/reaction";
import type { NostrEvent } from "@streets/core/nostr/event";
import { encodeBech32 } from "@streets/core/nostr/nip19";
import { type Component, createSignal } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { setDefaultReaction } from "../default-reaction-setting";
import avatarUrl from "../storybook/avatar-fixture.svg";
import emojiUrl from "../storybook/emoji-fixture.svg";
import { type EventScene, EventSceneProvider } from "../storybook/EventScene";
import clipUrl from "../storybook/media-clip.mp4";
import landscapeUrl from "../storybook/media-landscape.svg";
import { type StoryAuthor, createStoryAuthor } from "../storybook/story-events";
import SegmentedControl from "../ui/SegmentedControl";
import Event, { type EventSize } from "./Event";
import { LinkCardModeProvider } from "./link-card";

const alice = createStoryAuthor(11, {
  name: "alice",
  displayName: "あいもの",
  picture: avatarUrl,
});
const bob = createStoryAuthor(22, { name: "bob", displayName: "ほかのひと" });
const carol = createStoryAuthor(33, { name: "carol" });
const nameless = createStoryAuthor(44);
const viewer = createStoryAuthor(55, { name: "me", displayName: "わたし" });
const profiles = [
  alice.profile(),
  bob.profile(),
  carol.profile(),
  viewer.profile(),
];

const plain = alice.note(
  "マルチカラムのクライアントは、1 列に入る情報量が体験を決める。余白は削るところと残すところを分ける。",
);
const tokens = bob.note(
  `リンク https://example.com/#nostr 、ハッシュタグ #Nostr と #東京 、NIP-21メンション nostr:${encodeBech32("npub", alice.pubkey)} 、裸のNIP-19メンション ${encodeBech32("npub", carol.pubkey)} 、カスタム絵文字 :party: を含む本文。`,
  [
    ["t", "nostr"],
    ["emoji", "party", emojiUrl],
  ],
);
const hashtagInNarrowColumn = bob.note(
  "今日の散歩 #東京 #とても長いハッシュタグを狭いカラムで表示する #Nostr",
);
const longBody = alice.note(
  Array.from(
    { length: 18 },
    (_, index) =>
      `${index + 1}. 長い投稿でもタイムライン全体を占有しないように、最初は本文を省略して表示します。リンク https://example.com/${index + 1} と絵文字 🏙️ を含む行です。`,
  ).join("\n"),
);
const reply = alice.reply(plain, "返信の本文。");
const quoted = bob.note("引用されたノートの本文。");
const quote = alice.quote(quoted, "引用つきのノート。");
const quoteOfQuote = carol.quote(
  quote,
  "引用の引用。中の引用は取りにいかない。",
);
const repost = carol.repost(plain);
const react = (author: StoryAuthor, input: ReactionInput) =>
  author.event(buildReaction(plain, input));
const engaged = [
  bob.reply(plain, "わかる"),
  carol.reply(plain, "たしかに"),
  react(bob, { type: "like" }),
  react(carol, { type: "like" }),
  react(alice, { type: "text", content: "🥰" }),
  react(bob, { type: "text", content: "🥰" }),
  react(carol, { type: "text", content: "🎉" }),
  react(bob, { type: "emoji", shortcode: "party", url: emojiUrl }),
  react(carol, { type: "text", content: "とても長いテキストのリアクション" }),
  react(alice, { type: "emoji", shortcode: "broken", url: "/missing.png" }),
];
const viewerEngaged = [
  react(viewer, { type: "like" }),
  react(viewer, { type: "text", content: "🥰" }),
  viewer.repost(plain),
  viewer.event(addBookmark({ type: "note", value: plain.id })(undefined)),
];
const likeReaction = react(bob, { type: "like" });
const textReaction = react(carol, { type: "text", content: "🥰" });
const emojiReaction = react(bob, {
  type: "emoji",
  shortcode: "party",
  url: emojiUrl,
});
const longReaction = react(carol, {
  type: "text",
  content: "とても長いテキストのリアクションで一行に収まらないもの",
});
const unknown = alice.event({ kind: 30023, tags: [], content: "# 長文記事" });
const noProfile = nameless.note("kind:0 が無い人の投稿。");
const profileAuthor = createStoryAuthor(66, {
  name: "dave",
  displayName: "でいぶ",
  picture: avatarUrl,
  about: "カラムで Nostr を読んでいます。\n写真と散歩の話が多めです。",
});
const profileEvent = profileAuthor.profile();
const longNameAuthor = createStoryAuthor(77, {
  name: "a_very_long_account_name_that_does_not_fit_in_a_column",
  displayName: "とても長い表示名でカラムの幅には収まりきらない人の名前",
  picture: avatarUrl,
  about: Array.from(
    { length: 6 },
    () => "自己紹介が長いときは 3 行で切ります。",
  ).join(""),
});
const longNameProfile = longNameAuthor.profile();
const noAboutAuthor = createStoryAuthor(88, {
  name: "erin",
  picture: avatarUrl,
});
const noAboutProfile = noAboutAuthor.profile();
const noPictureAuthor = createStoryAuthor(99, {
  name: "frank",
  displayName: "ふらんく",
  about: "アイコンを設定していない人。",
});
const noPictureProfile = noPictureAuthor.profile();
const videoUrl = new URL(clipUrl, location.href).href;
const withVideo = alice.note(`動画を添えました。\n${videoUrl}`, [
  ["imeta", `url ${videoUrl}`, "m video/mp4", "dim 320x180"],
]);

const missingTarget = bob.note("このイベントはシーンに入れない");
const repostOfMissing = carol.repost(missingTarget);
const loadingTarget = bob.note("このイベントもシーンに入れない");
const repostOfLoading = carol.repost(loadingTarget);
const reactionToMissing = bob.event(
  buildReaction(missingTarget, { type: "like" }),
);

const ARTICLE = "https://example.com/articles/streets";
const MISSING = "https://example.com/no-ogp";
const withLinks = alice.note(
  `読んだ記事 ${ARTICLE} と、題名の取れないページ ${MISSING}`,
);
const linkScene = {
  linkCards: {
    [ARTICLE]: {
      url: ARTICLE,
      title: "カラムで Nostr を読む",
      description: "Streets の使い方を、カラムの足し方から順に紹介します。",
      image: landscapeUrl,
      siteName: "Example Blog",
    },
    [MISSING]: null,
  },
};

type Props = {
  event: NostrEvent;
  scene: EventScene;
  size: EventSize;
  /** 返信のとき、返信先を上に 1 件出す（タイムラインのカラムと同じ）。 */
  replyContext?: boolean;
  expandMedia?: boolean;
  linkCards?: LinkCardMode;
  /** いいねボタンで送るもの。省くとハート。 */
  defaultReaction?: ReactionInput;
};

const EventStory: Component<Props> = (props) => {
  // 端末の設定をそのまま差し替える。どのストーリーも必ず当てるので、前の値は残らない。
  setDefaultReaction(props.defaultReaction ?? { type: "like" });
  return (
    <EventSceneProvider scene={props.scene}>
      {/* 実際のカラム幅で、名前・時刻・リアクションチップの収まりを見る。 */}
      <div class="w-[360px]">
        <LinkCardModeProvider value={() => props.linkCards ?? "compact"}>
          <Event
            event={props.event}
            size={props.size}
            replyContext={props.replyContext}
            expandMedia={props.expandMedia}
          />
        </LinkCardModeProvider>
      </div>
    </EventSceneProvider>
  );
};

const scene = (...events: NostrEvent[]): EventScene => ({
  events: [...profiles, ...events],
  viewer,
});

const meta = {
  title: "イベント/Event",
  component: EventStory,
  args: { size: "normal" },
  argTypes: {
    size: { control: "inline-radio", options: ["normal", "compact"] },
    event: { control: false },
    scene: { control: false },
    defaultReaction: { control: false },
  },
} satisfies Meta<typeof EventStory>;

export default meta;
type Story = StoryObj<typeof meta>;

export const 通常: Story = { args: { event: plain, scene: scene(plain) } };

export const 反応の件数: Story = {
  args: { event: plain, scene: scene(plain, ...engaged) },
};

export const 自分が反応済み: Story = {
  args: { event: plain, scene: scene(plain, ...engaged, ...viewerEngaged) },
};

export const いいねボタンがUnicodeの絵文字: Story = {
  args: {
    event: plain,
    scene: scene(plain, ...engaged),
    defaultReaction: { type: "text", content: "🎉" },
  },
};

/** 🥰 を送った後。いいねボタンは既定の 🥰 で「済み」になる。 */
export const いいねボタンの絵文字で送った後: Story = {
  args: {
    event: plain,
    scene: scene(plain, ...engaged, ...viewerEngaged),
    defaultReaction: { type: "text", content: "🥰" },
  },
};

/** 前にハートを送っていても、既定を変えた後は新しい絵文字で押せる。 */
export const 既定を変える前に送ったハート: Story = {
  args: {
    event: plain,
    scene: scene(plain, react(viewer, { type: "like" })),
    defaultReaction: { type: "text", content: "🎉" },
  },
};

export const いいねボタンがカスタム絵文字: Story = {
  args: {
    event: plain,
    scene: scene(plain, ...engaged),
    defaultReaction: {
      type: "emoji",
      shortcode: "party",
      url: new URL(emojiUrl, location.href).href,
    },
  },
};

export const いいねボタンのカスタム絵文字が読めない: Story = {
  args: {
    event: plain,
    scene: scene(plain, ...engaged),
    defaultReaction: {
      type: "emoji",
      shortcode: "broken",
      url: "https://example.invalid/broken.png",
    },
  },
};

export const 書き込みに失敗する: Story = {
  args: { event: plain, scene: { ...scene(plain), failWrites: true } },
};

export const ログインしていない: Story = {
  args: { event: plain, scene: { events: [...profiles, plain] } },
};

export const 本文のトークン: Story = {
  args: { event: tokens, scene: scene(tokens) },
};

export const 狭いカラムのハッシュタグ: Story = {
  args: {
    event: hashtagInNarrowColumn,
    scene: scene(hashtagInNarrowColumn),
    size: "compact",
  },
};

export const 長い本文: Story = {
  args: { event: longBody, scene: scene(longBody) },
};

export const 動画つき: Story = {
  args: { event: withVideo, scene: scene(withVideo) },
};

export const 動画_コンパクト: Story = {
  args: { event: withVideo, scene: scene(withVideo), size: "compact" },
};

export const 動画の展開を切る: Story = {
  args: { event: withVideo, scene: scene(withVideo), expandMedia: false },
};

export const 返信: Story = { args: { event: reply, scene: scene(reply) } };

/** タイムラインでは、返信先を 1 件だけ線でつないで上に出す。 */
export const 返信_返信先つき: Story = {
  args: { event: reply, scene: scene(reply, plain), replyContext: true },
};

/** 返信先がまだ手元に無いとき。連鎖して取りにいかないので、ここで止まる。 */
export const 返信_返信先が見つからない: Story = {
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

export const リポスト: Story = {
  args: { event: repost, scene: scene(repost, plain) },
};

export const リポスト元を読み込み中: Story = {
  args: { event: repostOfLoading, scene: scene(repostOfLoading) },
};

export const リポスト元が見つからない: Story = {
  args: {
    event: repostOfMissing,
    scene: { ...scene(repostOfMissing), missingIds: [missingTarget.id] },
  },
};

// 通知カラムに流れるリアクション。元のノートは自分のものなので、アクション列を出さない。
export const リアクション_いいね: Story = {
  args: { event: likeReaction, scene: scene(likeReaction, plain) },
};

export const リアクション_絵文字: Story = {
  args: { event: textReaction, scene: scene(textReaction, plain) },
};

export const リアクション_カスタム絵文字: Story = {
  args: { event: emojiReaction, scene: scene(emojiReaction, plain) },
};

export const リアクション_長い文字: Story = {
  args: { event: longReaction, scene: scene(longReaction, plain) },
};

export const リアクションの対象が見つからない: Story = {
  args: {
    event: reactionToMissing,
    scene: { ...scene(reactionToMissing), missingIds: [missingTarget.id] },
  },
};

export const 未対応のkind: Story = {
  args: { event: unknown, scene: scene(unknown) },
};

export const プロフィールが無い: Story = {
  args: { event: noProfile, scene: scene(noProfile) },
};

/** 検索などで kind:0 が届いたとき。フォロー一覧と同じユーザーの行で描く。 */
export const プロフィール: Story = {
  args: { event: profileEvent, scene: scene(profileEvent) },
};

export const プロフィール_名前が長い: Story = {
  args: { event: longNameProfile, scene: scene(longNameProfile) },
};

export const プロフィール_自己紹介が無い: Story = {
  args: { event: noAboutProfile, scene: scene(noAboutProfile) },
};

export const プロフィール_画像が無い: Story = {
  args: { event: noPictureProfile, scene: scene(noPictureProfile) },
};

/**
 * 形の崩れたイベント（リレーから来るものは形を保証されない）。描画の途中で投げても、
 * この 1 件だけを「表示できませんでした」に置き換え、周りは描き続ける。
 */
export const 描けないイベント: Story = {
  args: {
    event: { ...unknown, kind: 1, tags: null } as unknown as NostrEvent,
    scene: scene(),
  },
};

export const リンクのカード_小さく: Story = {
  args: { event: withLinks, scene: { ...scene(withLinks), ...linkScene } },
};

export const リンクのカード_大きく: Story = {
  args: {
    event: withLinks,
    scene: { ...scene(withLinks), ...linkScene },
    linkCards: "large",
  },
};

export const リンクのカード_コンパクト: Story = {
  args: {
    event: withLinks,
    scene: { ...scene(withLinks), ...linkScene },
    size: "compact",
  },
};

export const リンクのカード_出さない: Story = {
  args: {
    event: withLinks,
    scene: { ...scene(withLinks), ...linkScene },
    linkCards: "off",
  },
};

/** カラムの設定を変えたときに、描いてあるカードがその場で変わることを確かめる。 */
export const リンクのカード_設定を切り替える: Story = {
  args: { event: withLinks, scene: { ...scene(withLinks), ...linkScene } },
  render: (props) => {
    const [mode, setMode] = createSignal<LinkCardMode>("compact");
    return (
      <div class="flex flex-col gap-3">
        <div class="w-[360px]">
          <SegmentedControl
            label="リンクのカード"
            options={[
              { value: "off", label: "出さない" },
              { value: "compact", label: "小さく" },
              { value: "large", label: "大きく" },
            ]}
            value={mode()}
            onChange={setMode}
            block
          />
        </div>
        <EventSceneProvider scene={props.scene}>
          <div class="w-[360px]">
            <LinkCardModeProvider value={mode}>
              <Event event={props.event} size={props.size} />
            </LinkCardModeProvider>
          </div>
        </EventSceneProvider>
      </div>
    );
  },
};
