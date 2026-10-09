import {
  buildChannelMessage,
  buildHideMessage,
  buildMuteUser,
} from "@streets/core/nostr/build/channel";
import type { EventDraft } from "@streets/core/nostr/build/draft";
import { chatModeration } from "@streets/core/nostr/channel";
import type { NostrEvent } from "@streets/core/nostr/event";
import type { Paging } from "@streets/core/read/source";
import type { ChatOrder } from "@streets/core/settings/chat-order-setting";
import { chatRows } from "@streets/core/view/chat";
import { createSignal, onCleanup } from "solid-js";
import { createStore, reconcile } from "solid-js/store";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { ComposeMediator } from "../note/ComposeMediator";
import type { EventSize } from "../note/Event";
import avatarUrl from "../storybook/avatar-fixture.svg";
import { EventSceneProvider } from "../storybook/EventScene";
import portraitUrl from "../storybook/media-portrait.svg?no-inline";
import { type StoryAuthor, createStoryAuthor } from "../storybook/story-events";
import ChatComposer from "./ChatComposer";
import ChatView from "./ChatView";

const CHANNEL = "1".repeat(64);
const viewer = createStoryAuthor(55, {
  name: "me",
  displayName: "わたし",
  picture: avatarUrl,
});
const aimono = createStoryAuthor(11, {
  name: "aimono",
  displayName: "あいもの",
});
const mama = createStoryAuthor(22, { name: "mama", displayName: "ママ" });
const other = createStoryAuthor(33, {
  name: "other",
  displayName: "ほかのひと",
});
const troll = createStoryAuthor(44, { name: "troll", displayName: "あらし" });
const spammer = createStoryAuthor(66, { name: "ad", displayName: "せんでん" });

// 人をまたいで時刻順に並べたいので、作る時刻をこちらで決める。
const BASE = 1_720_000_000;
const at = (author: StoryAuthor, minutes: number, draft: EventDraft) =>
  author.event({ ...draft, created_at: BASE + minutes * 60 } as EventDraft);
const say = (
  author: StoryAuthor,
  minutes: number,
  content: string,
  replyTo?: NostrEvent,
) => at(author, minutes, buildChannelMessage(CHANNEL, content, { replyTo }));

const hello = say(aimono, 0, "こんばんは。今日もやってますか？");
const usual = say(mama, 1, "やってるよ〜。いつもの？");
const quiet = say(mama, 2, "今日は静かだね");
const spam = say(
  spammer,
  3,
  "宣伝です。ここを見てください https://spam.example",
);
const sameOne = say(other, 8, "ぼくも同じのをください。", usual);
const trollAgain = say(troll, 9, "まだいるよ");
const long = say(
  aimono,
  12,
  "チャンネルのカラム、発言は下に足されていく並び。長い発言は折り返して、そのまま全部読めるようにする。".repeat(
    3,
  ),
);
const mine = say(viewer, 13, "わたしも来ました");
const longName = createStoryAuthor(77, {
  name: "averyveryverylongusernamethatdoesnotfitinthecolumn",
  displayName:
    "とても長い表示名の人で、カラムの幅にまったく収まらないくらい長い",
});
const replyToLong = say(
  longName,
  14,
  "長い発言への返信は、返信先を 1 行だけ出す",
  long,
);

// 閲覧注意（NIP-36）の付いた発言と、それへの返信。返信先の 1 行にも本文を出さない。
const portraitImageUrl = new URL(portraitUrl, location.href).href;
const warnedDraft = buildChannelMessage(
  CHANNEL,
  `今日のまかない、見た目は閲覧注意です\n${portraitImageUrl}`,
);
const warned = at(aimono, 15, {
  ...warnedDraft,
  tags: [...warnedDraft.tags, ["content-warning", "食べ物の写真"]],
});
const replyToWarned = say(mama, 16, "おいしそうだった！", warned);

const messages = [
  hello,
  usual,
  quiet,
  spam,
  sameOne,
  trollAgain,
  long,
  mine,
  replyToLong,
];
const warnedMessages = [...messages, warned, replyToWarned];
const moderation = chatModeration([
  at(mama, 4, buildHideMessage(spam.id, "宣伝")),
  at(viewer, 10, buildMuteUser(troll.pubkey)),
]);

/** 1 分おきに、何人かが順に話す。`from` 分目から `count` 件。 */
const chatter = (from: number, count: number): NostrEvent[] =>
  Array.from({ length: count }, (_, index) => {
    const minute = from + index;
    const author = [aimono, mama, other][minute % 3] ?? aimono;
    return say(author, minute, `${minute} 分目の発言です`);
  });

/** 上へ遡ると 50 件ずつ古い発言を足す。500 件を超えても止まらない。 */
const OLDER_PAGE = 50;
const olderPages = 20;

type Props = {
  /** 渡した `messages` を、`order` の並びで行にする。 */
  messages: readonly NostrEvent[];
  order: ChatOrder;
  paging: Paging;
  settled: boolean;
  unreachable?: boolean;
  /** 表示密度。カラム設定の「表示密度」に合わせる。 */
  size?: EventSize;
  replyTo?: NostrEvent;
  channelName?: string;
  /**
   * `many` は 600 件を並べる。`older` は遡るたびに古い発言を足す。`live` は
   * 2 秒ごとに新しい発言が届く。どれも rows・paging を使わない。署名に時間が
   * かかるので、そのストーリーを開いたときだけ作る。
   */
  scenario?: "many" | "older" | "live";
};

/** 取り足しを模す。上端が見えたら少し待ってから、1 ページぶん古い発言を足す。 */
const createOlderFeed = (order: ChatOrder) => {
  const allOlder = chatter(
    -OLDER_PAGE * olderPages,
    OLDER_PAGE * (olderPages + 1),
  );
  const [loaded, setLoaded] = createSignal(1);
  const [paging, setPaging] = createSignal<Paging>("idle");
  const rows = () =>
    chatRows(
      allOlder.slice(-OLDER_PAGE * loaded()),
      moderation,
      viewer.pubkey,
      order,
    );
  const loadOlder = () => {
    if (paging() !== "idle") return;
    setPaging("loading");
    setTimeout(() => {
      const next = loaded() + 1;
      setLoaded(next);
      setPaging(next > olderPages ? "exhausted" : "idle");
    }, 400);
  };
  return { rows, paging, loadOlder };
};

/**
 * 2 秒ごとに 1 件ずつ、新しい発言が届く。カラムと同じく行を key で突き合わせて
 * 当てる。作り直すと、開いたメニューが届くたびに消える。
 */
const createLiveFeed = (order: ChatOrder) => {
  const all = chatter(0, 120);
  let shown = 20;
  const rows = () =>
    chatRows(all.slice(0, shown), moderation, viewer.pubkey, order);
  const [state, setState] = createStore({ rows: rows() });
  const timer = setInterval(() => {
    shown = Math.min(all.length, shown + 1);
    setState("rows", reconcile(rows(), { key: "key" }));
  }, 2000);
  onCleanup(() => clearInterval(timer));
  return () => state.rows;
};

const meta = {
  title: "チャット/チャンネル",
  component: (props: Props) => (
    <EventSceneProvider
      scene={{
        events: [
          viewer.profile(),
          aimono.profile(),
          mama.profile(),
          other.profile(),
          troll.profile(),
          spammer.profile(),
          longName.profile(),
          ...messages,
          warned,
          replyToWarned,
        ],
        viewer,
      }}
    >
      <div class="flex h-160 w-95 flex-col overflow-hidden border border-primary bg-primary">
        <ComposeMediator
          send={() => Promise.resolve()}
          failure="チャンネルに書けませんでした"
          onSent={() => {}}
        >
          {(state) => {
            const feed =
              props.scenario === "older"
                ? createOlderFeed(props.order)
                : undefined;
            const live =
              props.scenario === "live"
                ? createLiveFeed(props.order)
                : undefined;
            const many =
              props.scenario === "many"
                ? chatRows(
                    chatter(0, 600),
                    moderation,
                    viewer.pubkey,
                    props.order,
                  )
                : undefined;
            const rows = () =>
              chatRows(props.messages, moderation, viewer.pubkey, props.order);
            return (
              <ChatView
                rows={feed ? feed.rows() : live ? live() : (many ?? rows())}
                order={props.order}
                expandMedia
                size={props.size}
                paging={feed ? feed.paging() : props.paging}
                settled={props.settled}
                unreachable={props.unreachable}
                onLoadOlder={() => feed?.loadOlder()}
                composer={
                  <ChatComposer
                    state={state}
                    channelName={props.channelName ?? "ねこの画像チャンネル"}
                    replyTo={props.replyTo}
                  />
                }
              />
            );
          }}
        </ComposeMediator>
      </div>
    </EventSceneProvider>
  ),
  args: {
    messages,
    order: "newest-last",
    paging: "exhausted",
    settled: true,
  },
  argTypes: {
    messages: { control: false },
    order: {
      control: "inline-radio",
      options: ["newest-last", "newest-first"],
    },
    replyTo: { control: false },
    size: { control: "inline-radio", options: ["normal", "compact"] },
  },
} satisfies Meta<Props>;

export default meta;
type Story = StoryObj<typeof meta>;

export const 通常: Story = {};
/** カラム設定の「表示密度」が高いとき。文字と余白を詰める。 */
export const 密度が高い: Story = { args: { size: "compact" } };
export const 返信を書いている: Story = { args: { replyTo: usual } };
export const 古い発言を読み込み中: Story = { args: { paging: "loading" } };
/** 返事をしないリレーがあって、もう無いのか分からない。 */
export const 古い発言を読み込めなかった: Story = { args: { paging: "failed" } };
/** 一部のリレーから届いたが、ほかのリレーを待っている。揃うまでは古い発言を取り足さない。 */
export const ほかのリレーを待っている: Story = {
  args: {
    messages: messages.slice(0, 2),
    settled: false,
    paging: "waiting",
  },
};
export const まだ発言が無い: Story = { args: { messages: [] } };
/** チャンネルのリレーに繋がらなかった。発言が無いとは言い切らない。 */
export const リレーに繋がらなかった: Story = {
  args: { messages: [], unreachable: true },
};
export const 取得中: Story = {
  args: { messages: [], settled: false, paging: "waiting" },
};
/** 名前が長くても、書く欄は 1 行のまま始まる。 */
export const 長いチャンネル名: Story = {
  args: {
    channelName:
      "とても長い名前のチャンネルで、カラムの幅にまったく収まらないくらい長い名前",
  },
};
export const 狭いカラム: Story = {
  parameters: { viewport: { defaultViewport: "column320" } },
};
/** 見えている行とその前後だけを置く。開いたときは一番下から始まる。 */
export const 発言が多い: Story = { args: { scenario: "many" } };
/** 上へ遡ると 50 件ずつ足す。足しても読んでいる位置は動かず、500 件を超えても遡れる。 */
export const 遡って読む: Story = { args: { scenario: "older" } };

/**
 * 一番下で発言のメニューを開いたまま待つ。メニューの発言は動かず、
 * 「新しい発言 N 件」が出る。
 */
export const 発言が届き続ける: Story = { args: { scenario: "live" } };
/** 閲覧注意の発言は、押すまで本文と画像を出さない。返信の 1 行にも本文を出さない。 */
export const 閲覧注意の発言: Story = {
  args: { messages: warnedMessages },
};
/** 返信する欄には相手の名前だけを出すので、閲覧注意の発言でも本文は見えない。 */
export const 閲覧注意の発言に返信を書いている: Story = {
  args: {
    messages: warnedMessages,
    replyTo: warned,
  },
};

/** 新しい発言を上に足す並び。書く欄も上に置き、日付の区切りはその日の一番上の発言の上に出す。 */
export const 新しい発言を上に: Story = { args: { order: "newest-first" } };
export const 新しい発言を上に_返信を書いている: Story = {
  args: { order: "newest-first", replyTo: usual },
};
export const 新しい発言を上に_まだ発言が無い: Story = {
  args: { order: "newest-first", messages: [] },
};
export const 新しい発言を上に_狭いカラム: Story = {
  args: { order: "newest-first" },
  parameters: { viewport: { defaultViewport: "column320" } },
};
/** 下へ遡ると 50 件ずつ足す。足しても読んでいる位置は動かない。 */
export const 新しい発言を上に_遡って読む: Story = {
  args: { order: "newest-first", scenario: "older" },
};
/**
 * 一番上にいれば届いた発言へ上がる。下を読んでいる間は位置を保ち、
 * 「新しい N 件の発言」を出す。
 */
export const 新しい発言を上に_発言が届き続ける: Story = {
  args: { order: "newest-first", scenario: "live" },
};
