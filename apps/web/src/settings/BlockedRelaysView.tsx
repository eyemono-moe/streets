import type {
  ItemVisibility,
  PrivatePartStatus,
} from "@streets/core/nostr/private-tags";
import type { RelayListEntry } from "@streets/core/read/relay-list";
import type { RelayUrl } from "@streets/core/relay/relay-connection";
import {
  type BlockedRelayEntry,
  blockedRelayUrls,
} from "@streets/core/settings/blocked-relay-list";
import { type Component, For, Show, createSignal } from "solid-js";
import RelayInput from "../deck/RelayInput";
import { VISIBILITY_LABEL } from "../lists/visibility";
import { useDispatch } from "../ui-events";
import IconButton from "../ui/IconButton";
import SegmentedControl from "../ui/SegmentedControl";
import SettingsSection from "./SettingsSection";

const VISIBILITY_HINT: Record<ItemVisibility, string> = {
  private:
    "非公開：暗号化して保存するので、どのリレーに繋がないかはほかの人には分かりません。",
  public: "公開：どのリレーに繋がないかを、ほかの人も見られます。",
};

const PRIVATE_PART_NOTICE: Partial<Record<PrivatePartStatus, string>> = {
  unavailable:
    "今のログインの方法では非公開の項目を扱えないため、公開の項目だけを表示しています。",
  invalid:
    "非公開の項目を読み取れませんでした。公開の項目だけを表示しています。前に非公開で入れたリレーにも、引き続きつなぎません。",
};

export type BlockedRelaysViewProps = {
  entries: readonly BlockedRelayEntry[];
  /** 非公開の項目を読み書きできるか。読み込み中は undefined。 */
  privatePart: PrivatePartStatus | undefined;
  saving: boolean;
  /** 自分のアカウントで使っているリレー。足す欄の候補にし、重なりを知らせる。 */
  account: readonly RelayListEntry[];
  /** 足す欄の候補にする、フォローしている人の書き込みリレー。渡さなければ読み取り層から引く。 */
  followeeWriteRelays?: readonly (readonly RelayUrl[])[];
};

/** 繋がないリレーの設定。今の一覧を受け取って描き、変えたらイベントを上へ渡す。 */
const BlockedRelaysView: Component<BlockedRelaysViewProps> = (props) => {
  const dispatch = useDispatch();
  const urls = () => blockedRelayUrls(props.entries);
  const privateReady = () => props.privatePart === "ready";
  // 安全な側に倒す。どこを避けているかを、うっかり公開で知らせない。
  const [chosen, setChosen] = createSignal<ItemVisibility>("private");
  const visibility = (): ItemVisibility =>
    privateReady() ? chosen() : "public";
  const ownBlocked = () =>
    props.account
      .map((entry) => entry.url)
      .filter((url) => urls().includes(url));
  return (
    <SettingsSection
      id="blockedRelays"
      scope="account"
      description="フォローしている人の投稿を読むときや、返信を相手に届けるときは、その人が使っているリレーへ自動でつなぎます。ここに入れたリレーには、どの場面でもつなぎません。"
    >
      <Show when={props.privatePart && PRIVATE_PART_NOTICE[props.privatePart]}>
        {(notice) => (
          <p
            class="rounded-2 p-3 text-caption"
            classList={{
              "c-danger bg-danger-subtle": props.privatePart === "invalid",
              "c-secondary bg-secondary": props.privatePart !== "invalid",
            }}
          >
            {notice()}
          </p>
        )}
      </Show>
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
        when={props.entries.length > 0}
        fallback={
          <p class="c-secondary rounded-2 border border-primary p-3 text-caption">
            まだありません。つないでほしくないリレーの URL を入力してください。
          </p>
        }
      >
        <ul class="flex flex-col gap-px overflow-hidden rounded-2 border border-primary bg-tertiary">
          <For each={props.entries}>
            {(entry) => (
              <li class="flex flex-wrap items-center gap-x-3 gap-y-1.5 bg-primary px-3 py-2.5">
                <span class="c-primary min-w-48 flex-1 break-all text-body">
                  {entry.url}
                </span>
                <div class="ml-auto flex items-center gap-2">
                  <span class="c-secondary rounded-full bg-secondary px-2.5 py-0.5 font-600 text-caption">
                    {VISIBILITY_LABEL[entry.visibility]}
                  </span>
                  <IconButton
                    icon="i-material-symbols:do-not-disturb-on-outline-rounded"
                    label={`${entry.url} を一覧から外す`}
                    title="一覧から外す"
                    disabled={props.saving}
                    onClick={() =>
                      dispatch({ type: "blocked-relays/remove", entry })
                    }
                  />
                </div>
              </li>
            )}
          </For>
        </ul>
      </Show>
      <div class="flex flex-col gap-2">
        <RelayInput
          account={props.account}
          followeeWriteRelays={props.followeeWriteRelays}
          selected={urls()}
          disabled={props.saving}
          onAdd={(url) =>
            dispatch({
              type: "blocked-relays/add",
              url,
              visibility: visibility(),
            })
          }
          options={
            <SegmentedControl
              label="公開範囲"
              variant="secondary"
              value={visibility()}
              options={[
                {
                  value: "private",
                  label: VISIBILITY_LABEL.private,
                  disabled: !privateReady(),
                  hint: "今のログインの方法では、非公開の項目を扱えません",
                },
                { value: "public", label: VISIBILITY_LABEL.public },
              ]}
              onChange={setChosen}
            />
          }
        />
        <p class="c-secondary text-caption">{VISIBILITY_HINT[visibility()]}</p>
      </div>
    </SettingsSection>
  );
};

export default BlockedRelaysView;
