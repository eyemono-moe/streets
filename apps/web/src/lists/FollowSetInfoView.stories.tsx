import {
  type FollowSet,
  applyFollowSetChanges,
} from "@streets/core/lists/follow-set";
import { createSignal } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { EventSceneProvider } from "../storybook/EventScene";
import { Mediates } from "../ui-events";
import FollowSetInfoView from "./FollowSetInfoView";
import { storyMemberOf, storyProfiles, storySets } from "./story-lists";

type Args = {
  set?: FollowSet;
  settled: boolean;
  editable: boolean;
  privateReady: boolean;
  initialConfirmingDelete?: boolean;
  width: number;
};

/** アプリでは FollowSetMediator が裁定するイベントを、ここで手元のリストに当てる。 */
const Story = (props: Args) => {
  const [set, setSet] = createSignal(props.set);
  const change = (apply: Parameters<typeof applyFollowSetChanges>[1]) =>
    setSet((current) => current && applyFollowSetChanges(current, apply));
  return (
    <EventSceneProvider scene={{ events: storyProfiles() }}>
      <Mediates
        handle={(event) => {
          if (event.type === "follow-sets/add") {
            change([{ type: "add", member: event.member }]);
            return true;
          }
          if (event.type === "follow-sets/remove") {
            change([{ type: "remove", member: event.member }]);
            return true;
          }
          return true;
        }}
      >
        <div class="bg-primary" style={{ width: `${props.width}px` }}>
          <FollowSetInfoView
            set={set()}
            settled={props.settled}
            editable={props.editable}
            privateReady={props.privateReady}
            initialConfirmingDelete={props.initialConfirmingDelete}
          />
        </div>
      </Mediates>
    </EventSceneProvider>
  );
};

const meta = {
  title: "リスト/情報",
  component: Story,
  args: {
    set: storySets[0]!,
    settled: true,
    editable: true,
    privateReady: true,
    width: 380,
  },
  argTypes: { set: { control: false } },
} satisfies Meta<Args>;

export default meta;
type S = StoryObj<typeof meta>;

/** 自分のリスト。情報を直せて、人を足し外しできる。 */
export const 自分のリスト: S = {};

export const まだ誰もいない: S = { args: { set: storySets[2]! } };

/** 長い名前・説明と、長い表示名の人。 */
export const 長い名前: S = { args: { set: storySets[3]! } };

export const ミュートに使われていそう: S = { args: { set: storySets[4]! } };

export const 削除を確かめる: S = { args: { initialConfirmingDelete: true } };

/** 署名の方法が NIP-44 に対応していない。非公開は選べず、読めた公開のメンバーだけを出す。 */
export const 非公開を扱えない: S = {
  args: {
    privateReady: false,
    set: {
      ...storySets[0]!,
      privatePart: "unavailable",
      members: storySets[0]!.members.filter(
        (member) => member.visibility === "public",
      ),
    },
  },
};

export const 非公開を読めなかった: S = {
  args: {
    set: {
      ...storySets[0]!,
      privatePart: "invalid",
      members: storySets[0]!.members.filter(
        (member) => member.visibility === "public",
      ),
    },
  },
};

/** ほかの人のリスト。直す・足し外しの欄を出さない。 */
export const ほかの人のリスト: S = {
  args: { set: storyMemberOf[0]!, editable: false },
};

export const 読み込み中: S = { args: { set: undefined, settled: false } };

export const 見つからない: S = { args: { set: undefined } };

export const 狭いカラム: S = { args: { width: 280 } };
