import { addBookmark } from "@streets/core/nostr/build/bookmark";
import { pinNote } from "@streets/core/nostr/pinned-notes";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import emojiUrl from "../../storybook/emoji-fixture.svg";
import {
  EventStory,
  alice,
  bob,
  carol,
  eventStoryMeta,
  plain,
  profiles,
  react,
  scene,
  tokens,
  viewer,
} from "./event-story";

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

const meta = {
  ...eventStoryMeta,
  title: "イベント/投稿/操作のボタン",
} satisfies Meta<typeof EventStory>;

export default meta;
type Story = StoryObj<typeof meta>;

export const 反応の件数: Story = {
  args: { event: plain, scene: scene(plain, ...engaged) },
};

/**
 * ミュートしている人（ほかのひと）のリアクションを除いたとき。その人だけが付けた
 * 絵文字（:party:）はチップごと出さない。
 */
export const ミュートしている人のリアクション: Story = {
  args: {
    event: plain,
    scene: {
      ...scene(plain, ...engaged),
      mutes: [
        {
          target: { type: "pubkey", value: bob.pubkey },
          visibility: "private",
        },
      ],
    },
  },
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

/** 元から白黒の絵文字。押す前と押した後を、背景だけで見分けられるか。 */
export const いいねボタンが白黒の絵文字: Story = {
  args: {
    event: plain,
    scene: scene(plain, ...engaged),
    defaultReaction: { type: "text", content: "🖤" },
  },
};

export const いいねボタンが白黒の絵文字_送った後: Story = {
  args: {
    event: plain,
    scene: scene(
      plain,
      ...engaged,
      react(viewer, { type: "text", content: "🖤" }),
    ),
    defaultReaction: { type: "text", content: "🖤" },
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

/** いいねボタンの絵文字にホバーしても、本文のリンクやメンションの色が変わらないか。 */
export const いいねボタンの絵文字と本文のリンク: Story = {
  args: {
    event: tokens,
    scene: scene(tokens),
    defaultReaction: { type: "text", content: "🎉" },
  },
};

export const 書き込みに失敗する: Story = {
  args: { event: plain, scene: { ...scene(plain), failWrites: true } },
};

export const ログインしていない: Story = {
  args: { event: plain, scene: { events: [...profiles, plain] } },
};

/**
 * メニューにしかなかった操作も欄に出せる。ミュートの一覧を読む段が無いので、
 * ここではミュートは押せない見た目になる。
 */
export const 欄にメニューの操作を出す: Story = {
  args: {
    event: plain,
    scene: scene(plain, ...engaged),
    actionLayout: {
      bar: ["reply", "like", "activity", "copy-link", "details", "mute-event"],
      menu: ["repost", "react", "zap", "bookmark", "pin", "broadcast"],
    },
  },
};

/** 欄の数が少ないとき。欄から外した操作は右上のメニューに入る。 */
export const 欄の操作が少ない: Story = {
  args: {
    event: plain,
    scene: scene(plain, ...engaged),
    actionLayout: {
      bar: ["reply", "like"],
      menu: [
        "repost",
        "react",
        "zap",
        "bookmark",
        "pin",
        "activity",
        "copy-link",
        "details",
        "mute-event",
        "broadcast",
      ],
    },
  },
};

/** 欄に何も出さない。本文の下に空の行を残さない。 */
export const 欄に何も出さない: Story = {
  args: {
    event: plain,
    scene: scene(plain, ...engaged),
    actionLayout: {
      bar: [],
      menu: [
        "reply",
        "repost",
        "like",
        "react",
        "zap",
        "bookmark",
        "pin",
        "activity",
        "copy-link",
        "details",
        "mute-event",
        "broadcast",
      ],
    },
  },
};

const pinBar = {
  bar: ["reply", "repost", "like", "zap", "bookmark", "pin"],
  menu: [
    "react",
    "activity",
    "copy-link",
    "details",
    "mute-event",
    "broadcast",
  ],
} as const;

/** ピン留めを欄に出す。誰の投稿でもピン留めできる。 */
export const ピン留めを欄に出す: Story = {
  args: {
    event: plain,
    scene: scene(plain, ...engaged),
    actionLayout: { bar: [...pinBar.bar], menu: [...pinBar.menu] },
  },
};

export const ピン留め済み: Story = {
  args: {
    event: plain,
    scene: scene(plain, ...engaged, viewer.event(pinNote(plain.id)(undefined))),
    actionLayout: { bar: [...pinBar.bar], menu: [...pinBar.menu] },
  },
};

// NIP-51 のピン留めは kind:1 の投稿を入れるリスト。画像の投稿（kind:20）は入れない。
const picture = alice.event({
  kind: 20,
  content: "夕方の海。",
  tags: [],
});

export const ピン留めできない投稿: Story = {
  args: {
    event: picture,
    scene: scene(picture),
    actionLayout: { bar: [...pinBar.bar], menu: [...pinBar.menu] },
  },
};

/** 「ほかのリレーにも送る」を欄に出す。押すと送り先を選ぶダイアログが開く。 */
export const ブロードキャストを欄に出す: Story = {
  args: {
    event: plain,
    scene: scene(plain, ...engaged),
    actionLayout: {
      bar: ["reply", "repost", "like", "zap", "bookmark", "broadcast"],
      menu: ["react", "pin", "activity", "copy-link", "details", "mute-event"],
    },
  },
};
