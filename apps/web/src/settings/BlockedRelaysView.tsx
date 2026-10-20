import { Collapsible } from "@ark-ui/solid/collapsible";
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
import { t, plural } from "../i18n/locale";
import { VISIBILITY_LABEL } from "../lists/visibility";
import { useDispatch } from "../ui-events";
import IconButton from "../ui/IconButton";
import SegmentedControl from "../ui/SegmentedControl";
import SettingsSection from "./SettingsSection";

/**
 * 開いたまま出す件数。多い人は数十件になり、その下の足す欄やほかの設定が
 * 画面の外へ押し出されるので、それより多ければ畳んで件数だけを見せる。
 */
const OPEN_UP_TO = 5;

const visibilityHint = (visibility: ItemVisibility): string =>
  visibility === "private"
    ? t("settings.blockedRelays.hintPrivate")
    : t("settings.blockedRelays.hintPublic");

const privatePartNotice = (status: PrivatePartStatus): string | undefined => {
  switch (status) {
    case "unavailable":
      return t("settings.blockedRelays.noticeUnavailable");
    case "invalid":
      return t("settings.blockedRelays.noticeInvalid");
    default:
      return undefined;
  }
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
      description={t("settings.blockedRelays.description")}
    >
      <Show when={props.privatePart && privatePartNotice(props.privatePart)}>
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
            {t("settings.blockedRelays.ownBlocked", {
              relays: ownBlocked().join(t("settings.blockedRelays.separator")),
            })}
          </span>
        </p>
      </Show>
      <Show
        when={props.entries.length > 0}
        fallback={
          <p class="c-secondary rounded-2 border border-primary p-3 text-caption">
            {t("settings.blockedRelays.empty")}
          </p>
        }
      >
        <Collapsible.Root
          lazyMount
          unmountOnExit
          defaultOpen={props.entries.length <= OPEN_UP_TO}
          class="flex flex-col gap-2"
        >
          <Collapsible.Trigger class="group c-secondary flex w-fit items-center gap-1 bg-transparent p-0 font-600 text-caption enabled:cursor-pointer">
            {plural("settings.blockedRelays.count", props.entries.length)}
            <span
              class="i-material-symbols:expand-more-rounded size-4.5 shrink-0 transition-transform group-data-[state=open]:rotate-180"
              aria-hidden="true"
            />
          </Collapsible.Trigger>
          <Collapsible.Content class="motion-collapse">
            <ul class="flex max-h-80 flex-col gap-px overflow-y-auto rounded-2 border border-primary bg-tertiary">
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
                        label={t("settings.blockedRelays.removeLabel", {
                          relay: entry.url,
                        })}
                        title={t("settings.blockedRelays.remove")}
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
          </Collapsible.Content>
        </Collapsible.Root>
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
              label={t("settings.blockedRelays.visibility")}
              variant="secondary"
              value={visibility()}
              options={[
                {
                  value: "private",
                  label: VISIBILITY_LABEL.private,
                  disabled: !privateReady(),
                  hint: t("settings.blockedRelays.privateUnavailable"),
                },
                { value: "public", label: VISIBILITY_LABEL.public },
              ]}
              onChange={setChosen}
            />
          }
        />
        <p class="c-secondary text-caption">{visibilityHint(visibility())}</p>
      </div>
    </SettingsSection>
  );
};

export default BlockedRelaysView;
