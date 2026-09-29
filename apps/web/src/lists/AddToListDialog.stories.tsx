import { applyFollowSetChanges } from "@streets/core/lists/follow-set";
import { createSignal } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { EventSceneProvider } from "../storybook/EventScene";
import { Mediates } from "../ui-events";
import { AddToListDialogView } from "./AddToListDialog";
import { storyPeople, storySet, storySets } from "./story-lists";

type Args = Parameters<typeof AddToListDialogView>[0];

/** アプリでは FollowSetMediator が裁定するイベントを、ここで手元のリストに当てる。 */
const Story = (props: Args) => {
  const [sets, setSets] = createSignal(props.sets);
  const change = (
    identifier: string,
    apply: Parameters<typeof applyFollowSetChanges>[1],
  ) =>
    setSets((current) =>
      current.map((set) =>
        set.identifier === identifier ? applyFollowSetChanges(set, apply) : set,
      ),
    );
  return (
    <EventSceneProvider
      scene={{ events: storyPeople.map((person) => person.profile()) }}
    >
      <Mediates
        handle={(event) => {
          switch (event.type) {
            case "follow-sets/add":
              change(event.identifier, [{ type: "add", member: event.member }]);
              return true;
            case "follow-sets/remove":
              change(event.identifier, [
                { type: "remove", member: event.member },
              ]);
              return true;
            case "follow-sets/move":
              change(event.identifier, [
                { type: "remove", member: event.from },
                { type: "add", member: event.to },
              ]);
              return true;
            case "follow-sets/create":
              setSets((current) => [
                ...current,
                storySet(`new-${current.length}`, {
                  title: event.title,
                  members: event.member ? [event.member] : [],
                }),
              ]);
              return true;
            default:
              return false;
          }
        }}
      >
        <AddToListDialogView {...props} sets={sets()} />
      </Mediates>
    </EventSceneProvider>
  );
};

const meta = {
  title: "リスト/リストに追加",
  component: Story,
  args: {
    // 「開発者」には公開、「友だち」には入っていない人。
    pubkey: storyPeople[0]!.pubkey,
    sets: storySets,
    loading: false,
    privateReady: true,
    onClose: () => {},
  },
  argTypes: { sets: { control: false } },
} satisfies Meta<Args>;

export default meta;
type S = StoryObj<typeof meta>;

export const いつもの: S = {};

/** 「開発者」に非公開で入っている人。 */
export const 非公開で入っている: S = {
  args: { pubkey: storyPeople[3]!.pubkey },
};

export const 新しいリストを作る: S = { args: { initialCreating: true } };

export const 読み込み中: S = { args: { sets: [], loading: true } };

export const まだリストが無い: S = { args: { sets: [] } };

/** 署名の方法が NIP-44 に対応していない。公開でしか入れられない。 */
export const 非公開を扱えない: S = { args: { privateReady: false } };

export const 狭い画面: S = {
  parameters: { viewport: { defaultViewport: "mobile1" } },
};
