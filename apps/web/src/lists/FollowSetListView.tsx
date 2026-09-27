import {
  type FollowSet,
  followSetName,
  mayBeLegacyMuteSet,
} from "@streets/core/lists/follow-set";
import { type Component, For, Match, Show, Switch } from "solid-js";
import Avatar from "../note/Avatar";
import Name from "../note/Name";
import Button from "../ui/Button";
import ColumnTabs, { type ColumnTab } from "../ui/ColumnTabs";
import FollowSetPicture from "./FollowSetPicture";

/** 「12 人・非公開 3 人」。非公開がいなければ人数だけ。 */
export const memberCountLabel = (set: FollowSet): string => {
  const hidden = set.members.filter(
    (member) => member.visibility === "private",
  ).length;
  const total = `${set.members.length} 人`;
  return hidden > 0 ? `${total}・非公開 ${hidden} 人` : total;
};

/** 作った人。アイコンと名前を 1 行に並べる。 */
export const FollowSetAuthor: Component<{ pubkey: string }> = (props) => (
  <span class="flex min-w-0 items-center gap-1">
    <Avatar pubkey={props.pubkey} size="tiny" static />
    <span class="min-w-0 truncate">
      <Name pubkey={props.pubkey} />
    </span>
  </span>
);

/** `d` が `mute` のリストに添える一文。 */
export const LegacyMuteNotice: Component = () => (
  <span class="c-status-warn flex items-start gap-1 text-caption">
    <span
      class="i-material-symbols:warning-outline-rounded mt-0.5 size-3.5 shrink-0"
      aria-hidden="true"
    />
    一部のクライアントでは、このリストがミュートする人の指定として扱われている可能性があります
  </span>
);

const FollowSetRow: Component<{
  set: FollowSet;
  onOpen: (set: FollowSet) => void;
}> = (props) => (
  <li class="bg-primary">
    <button
      type="button"
      class="flex w-full min-w-0 cursor-pointer items-start gap-2.5 bg-transparent px-3 py-2.5 text-left outline-none hover:bg-alpha-hover focus-visible:ring-2 focus-visible:ring-accent-5 focus-visible:ring-inset"
      onClick={() => props.onOpen(props.set)}
    >
      <FollowSetPicture url={props.set.image} class="size-10 rounded-2" />
      <span class="flex min-w-0 flex-1 flex-col gap-0.5">
        <span class="c-primary truncate font-600 text-body">
          {followSetName(props.set)}
        </span>
        <span class="c-secondary flex min-w-0 items-center gap-1 text-caption">
          <FollowSetAuthor pubkey={props.set.pubkey} />
          <span class="shrink-0">・{memberCountLabel(props.set)}</span>
        </span>
        <Show when={props.set.description}>
          {(description) => (
            <span class="c-secondary truncate text-caption">
              {description()}
            </span>
          )}
        </Show>
        <Show when={mayBeLegacyMuteSet(props.set)}>
          <LegacyMuteNotice />
        </Show>
      </span>
    </button>
  </li>
);

const Section: Component<{
  title: string;
  sets: readonly FollowSet[];
  settled: boolean;
  empty: string;
  onOpen: (set: FollowSet) => void;
}> = (props) => (
  <section class="flex flex-col gap-1.5">
    <h3 class="c-secondary font-600 text-caption">{props.title}</h3>
    <Switch>
      <Match when={props.sets.length > 0}>
        <ul class="flex flex-col gap-px overflow-hidden rounded-2 border border-primary bg-tertiary">
          <For each={props.sets}>
            {(set) => <FollowSetRow set={set} onOpen={props.onOpen} />}
          </For>
        </ul>
      </Match>
      <Match when={props.settled}>
        <p class="c-secondary text-caption">{props.empty}</p>
      </Match>
      <Match when={true}>
        <p class="c-secondary text-caption">読み込み中…</p>
      </Match>
    </Switch>
  </section>
);

/**
 * リストの一覧。「作ったリスト」と「入っているリスト」の 2 つのタブに分ける
 * （チャンネルの一覧と同じ形）。「入っているリスト」は、初めて開いたときに
 * 取りにいく（`onBrowseMemberOf`）。
 */
const FollowSetListView: Component<{
  own: readonly FollowSet[];
  ownSettled: boolean;
  memberOf: readonly FollowSet[];
  memberOfSettled: boolean;
  /** 「入っているリスト」のタブを開いた。 */
  onBrowseMemberOf: () => void;
  onOpen: (set: FollowSet) => void;
  /** 渡すと、一番上に「リストを作る」を出す。 */
  onCreate?: () => void;
  /** Storybook で「入っているリスト」を開いた状態から始めるため。 */
  initialTab?: "own" | "member-of";
}> = (props) => {
  const tabs = (): ColumnTab[] => [
    {
      value: "own",
      label: "作ったリスト",
      content: () => (
        <div class="flex flex-col gap-3 p-3">
          <Section
            title="あなたが作ったリスト（名前順）"
            sets={props.own}
            settled={props.ownSettled}
            empty="まだリストがありません。人をまとめて、その人たちの投稿だけを流すカラムを作れます。"
            onOpen={props.onOpen}
          />
        </div>
      ),
    },
    {
      value: "member-of",
      label: "入っているリスト",
      content: () => (
        <div class="flex flex-col gap-3 p-3">
          <Section
            title="あなたを公開で入れているリスト"
            sets={props.memberOf}
            settled={props.memberOfSettled}
            empty="あなたを公開で入れているリストは見つかりませんでした。"
            onOpen={props.onOpen}
          />
          <p class="c-secondary text-caption">
            非公開で入れられたリストは、作った人にしか分からないので、ここには出ません。
          </p>
        </div>
      ),
    },
  ];
  return (
    <div class="flex flex-col">
      <Show when={props.onCreate}>
        {(create) => (
          <div class="px-3 pt-3">
            <Button
              variant="primary"
              shape="rounded"
              block
              icon="i-material-symbols:add-rounded"
              onClick={() => create()()}
            >
              リストを作る
            </Button>
          </div>
        )}
      </Show>
      <ColumnTabs
        label="リストの一覧"
        scroll="column"
        tabs={tabs()}
        defaultValue={props.initialTab ?? "own"}
        onValueChange={(value) => {
          if (value === "member-of") props.onBrowseMemberOf();
        }}
      />
    </div>
  );
};

export default FollowSetListView;
