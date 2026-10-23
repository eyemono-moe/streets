import { type Component, For, Match, Switch } from "solid-js";
import { plural, t } from "../i18n/locale";
import ProfileRow from "./ProfileRow";

/** フォロー・フォロワーの一覧。投稿と同じく、1px の隙間で区切る。 */
const ProfileList: Component<{
  people: readonly string[];
  settled: boolean;
  empty: string;
}> = (props) => (
  <Switch>
    <Match when={props.people.length > 0}>
      <div class="flex flex-col border-primary [&>*]:border-primary [&>*]:border-b">
        {/* 人数を知りたくて開くことが多い。取り終えるまでは、それまでに数えたぶん。 */}
        <p class="c-secondary px-4 py-2 text-caption">
          {props.settled
            ? plural("profile.list.count", props.people.length)
            : plural("profile.list.countLoading", props.people.length)}
        </p>
        <For each={props.people}>
          {(pubkey) => <ProfileRow pubkey={pubkey} />}
        </For>
      </div>
    </Match>
    <Match when={props.settled}>
      <p class="c-secondary p-4 text-caption">{props.empty}</p>
    </Match>
    <Match when={true}>
      <p class="c-secondary p-4 text-caption">{t("profile.list.loading")}</p>
    </Match>
  </Switch>
);

export default ProfileList;
