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

const messages = [hello, usual, quiet, spam, sameOne, trollAgain, long, mine];
const moderation = chatModeration([
  at(mama, 4, buildHideMessage(spam.id, "宣伝")),
  at(viewer, 10, buildMuteUser(troll.pubkey)),
]);

type Props = {
  rows: ReturnType<typeof chatRows>;
  paging: Paging;
  settled: boolean;
  replyTo?: NostrEvent;
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
          {(state) => (
            <ChatView
              rows={props.rows}
              relays={["wss://relay.example/"]}
              expandMedia
              paging={props.paging}
              settled={props.settled}
              onLoadOlder={() => {}}
              composer={
                <ChatComposer
                  state={state}
                  channelName="さびれたスナック"
                  replyTo={props.replyTo}
                />
              }
            />
          )}
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
export const まだ発言が無い: Story = { args: { rows: [] } };
export const 取得中: Story = {
  args: { rows: [], settled: false, paging: "waiting" },
};
export const 狭いカラム: Story = {
  parameters: { viewport: { defaultViewport: "column320" } },
};
