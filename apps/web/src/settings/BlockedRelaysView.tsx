import type { RelayListEntry } from "@streets/core/read/relay-list";
import type { RelayUrl } from "@streets/core/relay/relay-connection";
import { type Component, For, Show } from "solid-js";
import RelayInput from "../deck/RelayInput";
import { useDispatch } from "../ui-events";
import IconButton from "../ui/IconButton";
import SettingsSection from "./SettingsSection";

export type BlockedRelaysViewProps = {
  relays: readonly RelayUrl[];
  saving: boolean;
  /** 自分のアカウントで使っているリレー。足す欄の候補にし、重なりを知らせる。 */
  account: readonly RelayListEntry[];
  /** 足す欄の候補にする、フォローしている人の書き込みリレー。渡さなければ読み取り層から引く。 */
  followeeWriteRelays?: readonly (readonly RelayUrl[])[];
};

/** 繋がないリレーの設定。今の一覧を受け取って描き、変えたらイベントを上へ渡す。 */
const BlockedRelaysView: Component<BlockedRelaysViewProps> = (props) => {
  const dispatch = useDispatch();
  const ownBlocked = () =>
    props.account
      .map((entry) => entry.url)
      .filter((url) => props.relays.includes(url));
  return (
    <SettingsSection
      title="繋がないリレー"
      scope="account"
      description="フォローしている人の投稿を読むときや、返信を相手に届けるときは、その人が使っているリレーへ自動でつなぎます。ここに入れたリレーには、どの場面でもつなぎません。"
    >
      <Show when={ownBlocked().length > 0}>
        <p class="c-secondary flex items-start gap-1 rounded-2 border border-primary p-3 text-caption">
          <span
            class="i-material-symbols:warning-outline-rounded c-status-warn mt-0.5 size-4 shrink-0"
            aria-hidden="true"
          />
          <span>
            {`自分のアカウントで使っているリレーのうち ${ownBlocked().join("、")} も繋がないリレーに入っているため、そこへは読み書きしません。`}
          </span>
        </p>
      </Show>
      <Show
        when={props.relays.length > 0}
        fallback={
          <p class="c-secondary rounded-2 border border-primary p-3 text-caption">
            まだありません。つないでほしくないリレーの URL を入力してください。
          </p>
        }
      >
        <ul class="flex flex-col gap-px overflow-hidden rounded-2 border border-primary bg-tertiary">
          <For each={props.relays}>
            {(relay) => (
              <li class="flex flex-wrap items-center gap-x-3 gap-y-1.5 bg-primary px-3 py-2.5">
                <span class="c-primary min-w-48 flex-1 break-all text-body">
                  {relay}
                </span>
                <IconButton
                  icon="i-material-symbols:do-not-disturb-on-outline-rounded"
                  label={`${relay} を一覧から外す`}
                  title="一覧から外す"
                  disabled={props.saving}
                  onClick={() =>
                    dispatch({ type: "blocked-relays/remove", url: relay })
                  }
                />
              </li>
            )}
          </For>
        </ul>
      </Show>
      <RelayInput
        account={props.account}
        followeeWriteRelays={props.followeeWriteRelays}
        selected={props.relays}
        disabled={props.saving}
        onAdd={(url) => dispatch({ type: "blocked-relays/add", url })}
      />
    </SettingsSection>
  );
};

export default BlockedRelaysView;
