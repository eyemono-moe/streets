import { type Component, For, Match, Switch } from "solid-js";
import ProfileRow from "./ProfileRow";

/** フォロー・フォロワーの一覧。投稿と同じく、1px の隙間で区切る。 */
const ProfileList: Component<{
  people: readonly string[];
  settled: boolean;
  empty: string;
}> = (props) => (
  <Switch>
    <Match when={props.people.length > 0}>
      <div class="flex flex-col gap-px bg-tertiary pb-px">
        <For each={props.people}>
          {(pubkey) => <ProfileRow pubkey={pubkey} />}
        </For>
      </div>
    </Match>
    <Match when={props.settled}>
      <p class="c-secondary p-4 text-caption">{props.empty}</p>
    </Match>
    <Match when={true}>
      <p class="c-secondary p-4 text-caption">読み込み中…</p>
    </Match>
  </Switch>
);

export default ProfileList;
