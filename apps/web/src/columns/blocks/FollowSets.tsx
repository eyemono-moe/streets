import { buildFollowSetColumn } from "@streets/core/deck/column-presets";
import {
  followSetPostsSource,
  followSetSource,
  followSetsIncludingSource,
} from "@streets/core/deck/column-sources";
import { type ColumnDef, columnShow } from "@streets/core/deck/deck";
import {
  type FollowSet,
  followSetName,
  followSetsIncluding,
  latestFollowSets,
  readFollowSet,
} from "@streets/core/lists/follow-set";
import type { RelayUrl } from "@streets/core/relay/relay-connection";
import {
  type Accessor,
  type Component,
  Show,
  createComputed,
  createSignal,
} from "solid-js";
import { createStore, reconcile } from "solid-js/store";
import FollowSetInfoView from "../../lists/FollowSetInfoView";
import FollowSetListView from "../../lists/FollowSetListView";
import { useFollowSets } from "../../lists/FollowSetMediator";
import { useDispatch } from "../../ui-events";
import { createBlockSection, useColumnScope } from "../column-scope";
import EventList from "./EventList";

/**
 * 1 つのリスト。自分のものは段が読んで持っている（非公開のメンバーと、送って
 * いる途中の変更まで含む）。ほかの人のものは、公開の部分だけをここで読む。
 */
const useFollowSet = (pubkey: string, identifier: string) => {
  const own = useFollowSets();
  if (own && own.viewer === pubkey) {
    return {
      set: (): FollowSet | undefined => own.find(identifier),
      settled: () => !own.loading(),
      editable: true,
      privateReady: own.privateReady,
    };
  }
  const section = createBlockSection({
    source: () => followSetSource(pubkey, identifier),
    name: "list",
  });
  return {
    set: (): FollowSet | undefined => {
      const [latest] = latestFollowSets(section.items());
      return latest ? readFollowSet(latest) : undefined;
    },
    settled: () => section.status().phase === "settled",
    editable: false,
    privateReady: () => false,
  };
};

/** 行はリストの住所で突き合わせる。作り直した配列を渡すと、<For> が全行を作り直す。 */
type Keyed = FollowSet & { id: string };
const keyed = (sets: readonly FollowSet[]): Keyed[] =>
  sets.map((set) => ({ ...set, id: `${set.pubkey}:${set.identifier}` }));

/**
 * リストの一覧。作ったリストは段から、入っているリストは自分の読み込みリレー
 * から読む。入っているリストは、そのタブを初めて開いたときに取りにいく。
 */
export const FollowSetList: Component<{
  viewerRead: () => readonly RelayUrl[];
  /** 押したときにすること。渡さなければ、そのカラムの中に重ねて開く。 */
  onOpen?: (column: ColumnDef) => void;
}> = (props) => {
  const dispatch = useDispatch();
  const own = useFollowSets();
  const [browsed, setBrowsed] = createSignal(false);
  const memberOfSection = createBlockSection({
    source: () =>
      own && browsed()
        ? followSetsIncludingSource(own.viewer, props.viewerRead())
        : undefined,
    name: "member-of",
  });
  const [lists, setLists] = createStore<{ own: Keyed[]; memberOf: Keyed[] }>({
    own: [],
    memberOf: [],
  });
  createComputed(() => setLists("own", reconcile(keyed(own?.sets() ?? []))));
  createComputed(() =>
    setLists(
      "memberOf",
      reconcile(
        keyed(
          own ? followSetsIncluding(memberOfSection.items(), own.viewer) : [],
        ),
      ),
    ),
  );

  const open = (set: FollowSet) => {
    const column = buildFollowSetColumn(
      set.pubkey,
      set.identifier,
      followSetName(set),
    );
    if (props.onOpen) props.onOpen(column);
    else dispatch({ type: "stack/open", column });
  };

  return (
    <FollowSetListView
      own={lists.own}
      ownSettled={own ? !own.loading() : true}
      memberOf={lists.memberOf}
      memberOfSettled={memberOfSection.status().phase === "settled"}
      onBrowseMemberOf={() => setBrowsed(true)}
      onOpen={open}
      onCreate={
        own
          ? () => dispatch({ type: "follow-set-form/open-create" })
          : undefined
      }
    />
  );
};

/** リストに入っている人の投稿。 */
export const FollowSetTimeline: Component<{
  pubkey: string;
  identifier: string;
}> = (props) => {
  const scope = useColumnScope();
  const list = useFollowSet(props.pubkey, props.identifier);
  const members: Accessor<string[] | undefined> = () =>
    list.set()?.members.map((member) => member.pubkey);
  return (
    <Show
      when={list.set() !== undefined || !list.settled()}
      fallback={
        <p class="c-secondary p-4 text-caption">
          このリストが見つかりません。削除されたか、リレーから取得できませんでした。
        </p>
      }
    >
      <EventList
        source={() =>
          followSetPostsSource(members(), {
            chats: columnShow(scope.column()).chats,
          })
        }
      />
    </Show>
  );
};

/** リストの情報と、入っている人。 */
export const FollowSetInfo: Component<{
  pubkey: string;
  identifier: string;
}> = (props) => {
  const list = useFollowSet(props.pubkey, props.identifier);
  return (
    <FollowSetInfoView
      set={list.set()}
      settled={list.settled()}
      editable={list.editable}
      privateReady={list.privateReady()}
    />
  );
};
