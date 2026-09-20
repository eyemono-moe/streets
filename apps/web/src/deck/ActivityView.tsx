import type {
  ActivityReaction,
  EventActivity,
} from "@streets/core/view/event-activity";
import { type Component, For, type JSX, Match, Show, Switch } from "solid-js";
import Event from "../note/Event";
import { Mark } from "../note/ReactionList";
import ProfileRow from "../profile/ProfileRow";
import ColumnTabs, { type ColumnTab } from "../ui/ColumnTabs";

const Result: Component<{
  count: number;
  settled: boolean;
  incomplete?: boolean;
  empty: string;
  children: JSX.Element;
}> = (props) => (
  <Switch>
    <Match when={props.count > 0}>
      <Show when={props.incomplete}>
        <p class="c-secondary bg-secondary px-3 py-2 text-caption">
          一部のリレーからは取得できませんでした。
        </p>
      </Show>
      {props.children}
    </Match>
    <Match when={props.settled && props.incomplete}>
      <p class="c-secondary p-4 text-caption">取得できませんでした。</p>
    </Match>
    <Match when={props.settled}>
      <p class="c-secondary p-4 text-caption">{props.empty}</p>
    </Match>
    <Match when={true}>
      <p class="c-secondary p-4 text-caption">読み込み中…</p>
    </Match>
  </Switch>
);

const People: Component<{ people: readonly string[] }> = (props) => (
  <div class="flex flex-col border-primary [&>*]:border-primary [&>*]:border-b">
    <For each={props.people}>{(pubkey) => <ProfileRow pubkey={pubkey} />}</For>
  </div>
);

const Reactions: Component<{ people: readonly ActivityReaction[] }> = (
  props,
) => (
  <div class="flex flex-col border-primary [&>*]:border-primary [&>*]:border-b">
    <For each={props.people}>
      {(person) => (
        <ProfileRow
          pubkey={person.pubkey}
          detail={
            <span class="c-secondary flex flex-wrap gap-1.5 text-caption">
              <For each={person.contents}>
                {(reaction) => (
                  <span class="flex min-h-6 items-center rounded-1.5 border border-primary px-1.5">
                    <Mark content={reaction.content} mine={false} />
                    <Show when={reaction.count > 1}>
                      <span class="ml-1 tabular-nums">×{reaction.count}</span>
                    </Show>
                  </span>
                )}
              </For>
            </span>
          }
        />
      )}
    </For>
  </div>
);

export const ActivityView: Component<{
  activity: EventActivity;
  settled: boolean;
  incomplete?: boolean;
}> = (props) => {
  const common = () => ({
    settled: props.settled,
    incomplete: props.incomplete,
  });
  const tabs = (): ColumnTab[] => [
    {
      value: "reposts",
      label: "リポスト",
      count: props.activity.reposts.length,
      content: () => (
        <Result
          {...common()}
          count={props.activity.reposts.length}
          empty="リポストはまだありません。"
        >
          <People people={props.activity.reposts} />
        </Result>
      ),
    },
    {
      value: "quotes",
      label: "引用",
      count: props.activity.quotes.length,
      content: () => (
        <Result
          {...common()}
          count={props.activity.quotes.length}
          empty="引用はまだありません。"
        >
          <div class="flex flex-col [&>*]:border-primary [&>*]:border-b">
            <For each={props.activity.quotes}>
              {(event) => <Event event={event} size="normal" />}
            </For>
          </div>
        </Result>
      ),
    },
    {
      value: "reactions",
      label: "リアクション",
      count: props.activity.reactions.length,
      content: () => (
        <Result
          {...common()}
          count={props.activity.reactions.length}
          empty="リアクションはまだありません。"
        >
          <Reactions people={props.activity.reactions} />
        </Result>
      ),
    },
  ];

  return (
    <ColumnTabs
      label="アクティビティの種類"
      defaultValue="reposts"
      tabs={tabs()}
    />
  );
};

export default ActivityView;
