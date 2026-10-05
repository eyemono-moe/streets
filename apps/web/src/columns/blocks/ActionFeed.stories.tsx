import type { MuteEntry } from "@streets/core/moderation/mute-list";
import {
  type ReactionInput,
  buildReaction,
} from "@streets/core/nostr/build/reaction";
import type { NostrEvent } from "@streets/core/nostr/event";
import { actionRowsByTarget } from "@streets/core/view/notification-rows";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import avatarUrl from "../../storybook/avatar-fixture.svg";
import emojiUrl from "../../storybook/emoji-fixture.svg";
import { EventSceneProvider } from "../../storybook/EventScene";
import {
  type StoryAuthor,
  createStoryAuthor,
} from "../../storybook/story-events";
import { ActionFeedView } from "./ActionFeed";

const viewer = createStoryAuthor(55, { name: "me", displayName: "わたし" });
const alice = createStoryAuthor(11, {
  name: "alice",
  displayName: "あいもの",
  picture: avatarUrl,
});
const bob = createStoryAuthor(22, { name: "bob", displayName: "ぼぶ" });
const nameless = createStoryAuthor(33);
const crowd: StoryAuthor[] = Array.from({ length: 12 }, (_, index) =>
  createStoryAuthor(100 + index, {
    name: `user${index}`,
    displayName: `ひと${index + 1}`,
    picture: index % 3 === 0 ? avatarUrl : undefined,
  }),
);

const popular = alice.note("みんなが反応している人気の投稿です。");
const long = bob.note(
  "マルチカラムのクライアントは、1 列に入る情報量が体験を決める。".repeat(8),
);
const mine = viewer.note("自分の投稿にも反応が付きます。");
const missing = bob.note("シーンに入れないノート");

const react = (
  author: StoryAuthor,
  target: NostrEvent,
  input: ReactionInput = { type: "like" },
) => author.event(buildReaction(target, input));

// 新しい順。人気の投稿への反応は、ほかの反応と交互に届く。
const events: NostrEvent[] = [
  react(crowd[0]!, popular),
  react(nameless, long, { type: "text", content: "🎉" }),
  react(crowd[1]!, popular, {
    type: "emoji",
    shortcode: "blobcat",
    url: new URL(emojiUrl, location.href).href,
  }),
  crowd[2]!.repost(popular),
  react(alice, mine),
  ...crowd.slice(3).map((author) => react(author, popular)),
  crowd[3]!.repost(popular),
  react(alice, missing),
].sort((a, b) => b.created_at - a.created_at);

const profiles = [viewer, alice, bob, ...crowd].map((author) =>
  author.profile(),
);

type Props = {
  events: NostrEvent[];
  group: boolean;
  settled: boolean;
  compact: boolean;
  mutes?: MuteEntry[];
};

const meta = {
  title: "カラム/みんなのアクティビティ",
  component: (props: Props) => (
    <EventSceneProvider
      scene={{
        events: [...profiles, popular, long, mine, ...props.events],
        viewer,
        missingIds: [missing.id],
        mutes: props.mutes,
      }}
    >
      <div class="h-160 w-full overflow-y-auto bg-primary">
        <ActionFeedView
          rows={actionRowsByTarget(props.events, props.group)}
          settled={props.settled}
          size={props.compact ? "compact" : "normal"}
          expandMedia
        />
      </div>
    </EventSceneProvider>
  ),
  args: { events, group: true, settled: true, compact: false },
  argTypes: { events: { control: false }, mutes: { control: false } },
} satisfies Meta<Props>;

export default meta;
type Story = StoryObj<typeof meta>;

export const まとめる: Story = {};
export const まとめない: Story = { args: { group: false } };
export const 高密度: Story = { args: { compact: true } };
export const 取得中: Story = { args: { events: [], settled: false } };
export const 空: Story = { args: { events: [] } };
/** 語のミュートは相手のノートが届くまで分からないので、行は残して中身だけを畳む。 */
export const 相手の投稿がミュートの対象: Story = {
  args: {
    mutes: [{ target: { type: "word", value: "人気" }, visibility: "public" }],
  },
};
export const 狭いカラム: Story = {
  parameters: { viewport: { defaultViewport: "column320" } },
};
