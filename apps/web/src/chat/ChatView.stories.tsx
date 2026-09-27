import {
  buildChannelMessage,
  buildHideMessage,
  buildMuteUser,
} from "@streets/core/nostr/build/channel";
import type { EventDraft } from "@streets/core/nostr/build/draft";
import { chatModeration } from "@streets/core/nostr/channel";
import type { NostrEvent } from "@streets/core/nostr/event";
import type { Paging } from "@streets/core/read/source";
import { chatRows } from "@streets/core/view/chat";
import { createSignal } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { ComposeMediator } from "../note/ComposeMediator";
import avatarUrl from "../storybook/avatar-fixture.svg";
import { EventSceneProvider } from "../storybook/EventScene";
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
  rows: ReturnType<typeof chatRows>;
  paging: Paging;
  settled: boolean;
  replyTo?: NostrEvent;
  channelName?: string;
  /**
   * `many` は 600 件を並べる。`older` は上へ遡るたびに古い発言を足す。どちらも
   * rows・paging を使わない。署名に時間がかかるので、そのストーリーを開いたときだけ作る。
   */
  scenario?: "many" | "older";
};

/** 取り足しを模す。上端が見えたら少し待ってから、1 ページぶん古い発言を足す。 */
const createOlderFeed = () => {
  const allOlder = chatter(
    -OLDER_PAGE * olderPages,
    OLDER_PAGE * (olderPages + 1),
  );
  const [loaded, setLoaded] = createSignal(1);
  const [paging, setPaging] = createSignal<Paging>("idle");
  const rows = () =>
    chatRows(allOlder.slice(-OLDER_PAGE * loaded()), moderation, viewer.pubkey);
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
              props.scenario === "older" ? createOlderFeed() : undefined;
            const many =
              props.scenario === "many"
                ? chatRows(chatter(0, 600), moderation, viewer.pubkey)
                : undefined;
            return (
              <ChatView
                rows={feed ? feed.rows() : (many ?? props.rows)}
                relays={["wss://relay.example/"]}
                expandMedia
                paging={feed ? feed.paging() : props.paging}
                settled={props.settled}
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
    rows: chatRows(messages, moderation, viewer.pubkey),
    paging: "exhausted",
    settled: true,
  },
  argTypes: { rows: { control: false }, replyTo: { control: false } },
} satisfies Meta<Props>;

export default meta;
type Story = StoryObj<typeof meta>;

export const 通常: Story = {};
export const 返信を書いている: Story = { args: { replyTo: usual } };
export const 古い発言を読み込み中: Story = { args: { paging: "loading" } };
/** 一部のリレーから届いたが、ほかのリレーを待っている。揃うまでは古い発言を取り足さない。 */
export const ほかのリレーを待っている: Story = {
  args: {
    rows: chatRows(messages.slice(0, 2), moderation, viewer.pubkey),
    settled: false,
    paging: "waiting",
  },
};
export const まだ発言が無い: Story = { args: { rows: [] } };
export const 取得中: Story = {
  args: { rows: [], settled: false, paging: "waiting" },
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
