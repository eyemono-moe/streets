import type {
  ActivityReaction,
  EventActivity,
} from "@streets/core/view/event-activity";
import { type Component, For, Match, Show, Switch } from "solid-js";
import { Mark } from "../note/ReactionList";
import ProfileRow from "../profile/ProfileRow";

const Section: Component<{
  title: string;
  people: readonly string[];
}> = (props) => (
  <Show when={props.people.length > 0}>
    <section>
      <h3 class="c-secondary px-3 py-2 font-600 text-caption">
        {props.title}（{props.people.length}）
      </h3>
      <div class="flex flex-col border-primary [&>*]:border-primary [&>*]:border-b">
        <For each={props.people}>
          {(pubkey) => <ProfileRow pubkey={pubkey} />}
        </For>
      </div>
    </section>
  </Show>
);

const Reactions: Component<{ people: readonly ActivityReaction[] }> = (
  props,
) => (
  <Show when={props.people.length > 0}>
    <section>
      <h3 class="c-secondary px-3 py-2 font-600 text-caption">
        リアクション（{props.people.length}）
      </h3>
      <div class="flex flex-col border-primary [&>*]:border-primary [&>*]:border-b">
        <For each={props.people}>
          {(person) => (
            <ProfileRow
              pubkey={person.pubkey}
              detail={
                <span class="c-secondary flex flex-wrap gap-1.5 text-caption">
                  <For each={person.contents}>
                    {(content) => (
                      <span class="flex min-h-6 items-center rounded-1.5 border border-primary px-1.5">
                        <Mark content={content} mine={false} />
                      </span>
                    )}
                  </For>
                </span>
              }
            />
          )}
        </For>
      </div>
    </section>
  </Show>
);

export const ActivityView: Component<{
  activity: EventActivity;
  settled: boolean;
  incomplete?: boolean;
}> = (props) => {
  const count = () =>
    props.activity.reposts.length +
    props.activity.quotes.length +
    props.activity.reactions.length;
  return (
    <Switch>
      <Match when={count() > 0}>
        <Show when={props.incomplete}>
          <p class="c-secondary bg-secondary px-3 py-2 text-caption">
            一部のリレーからは取得できませんでした。
          </p>
        </Show>
        <Section title="リポスト" people={props.activity.reposts} />
        <Section title="引用" people={props.activity.quotes} />
        <Reactions people={props.activity.reactions} />
      </Match>
      <Match when={props.settled && props.incomplete}>
        <p class="c-secondary p-4 text-caption">
          アクティビティを取得できませんでした。
        </p>
      </Match>
      <Match when={props.settled}>
        <p class="c-secondary p-4 text-caption">
          アクティビティはまだありません。
        </p>
      </Match>
      <Match when={true}>
        <p class="c-secondary p-4 text-caption">読み込み中…</p>
      </Match>
    </Switch>
  );
};

export default ActivityView;
