import type { FollowSet } from "@streets/core/lists/follow-set";
import { type Component, For, Match, Show, Switch } from "solid-js";
import Button from "../ui/Button";
import ColumnTabs, { type ColumnTab } from "../ui/ColumnTabs";
import FollowSetSummary from "./FollowSetSummary";

const FollowSetRow: Component<{
  set: FollowSet;
  onOpen: (set: FollowSet) => void;
}> = (props) => (
  <li class="bg-primary">
    <button
      type="button"
      class="flex w-full min-w-0 cursor-pointer bg-transparent px-3 py-2.5 text-left outline-none hover:bg-alpha-hover focus-visible:ring-2 focus-visible:ring-accent-5 focus-visible:ring-inset"
      onClick={() => props.onOpen(props.set)}
    >
      <FollowSetSummary set={props.set} />
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
