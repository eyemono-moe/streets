import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { EventSceneProvider } from "../storybook/EventScene";
import FollowSetListView from "./FollowSetListView";
import { storyMemberOf, storyProfiles, storySets } from "./story-lists";

type Args = Parameters<typeof FollowSetListView>[0] & { width: number };

const Story = (props: Args) => (
  <EventSceneProvider scene={{ events: storyProfiles() }}>
    <div class="bg-primary" style={{ width: `${props.width}px` }}>
      <FollowSetListView {...props} />
    </div>
  </EventSceneProvider>
);

const meta = {
  title: "リスト/一覧",
  component: Story,
  args: {
    own: storySets,
    ownSettled: true,
    memberOf: storyMemberOf,
    memberOfSettled: true,
    width: 360,
    onBrowseMemberOf: () => {},
    onOpen: () => {},
    onCreate: () => {},
  },
  argTypes: { own: { control: false }, memberOf: { control: false } },
} satisfies Meta<Args>;

export default meta;
type S = StoryObj<typeof meta>;

/** 画像のあるリスト、空のリスト、長い名前、ミュートに使われていそうなリストを含む。 */
export const 作ったリスト: S = {};

/** ほかの人が作り、自分が公開で入っているリスト。題名の無いもの（`d` で呼ぶ）も含む。 */
export const 入っているリスト: S = { args: { initialTab: "member-of" } };

export const 読み込み中: S = { args: { own: [], ownSettled: false } };

export const まだ無い: S = { args: { own: [] } };

export const 入っているリストが無い: S = {
  args: { initialTab: "member-of", memberOf: [] },
};

export const 入っているリストを探している: S = {
  args: { initialTab: "member-of", memberOf: [], memberOfSettled: false },
};

/** ログインしていない。作るボタンを出さない。 */
export const ログインしていない: S = { args: { onCreate: undefined } };

export const 狭いカラム: S = { args: { width: 280 } };
