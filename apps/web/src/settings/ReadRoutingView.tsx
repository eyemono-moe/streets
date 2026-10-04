import type { RelayListEntry } from "@streets/core/read/relay-list";
import type { RelayUrl } from "@streets/core/relay/relay-connection";
import {
  type ReadRoutingMode,
  readRoutingFor,
} from "@streets/core/settings/read-routing-setting";
import { relayLabel } from "@streets/core/settings/relay-edit";
import { type Component, For, Match, Show, Switch } from "solid-js";
import { useDispatch } from "../ui-events";
import SegmentedControl from "../ui/SegmentedControl";
import SettingsSection from "./SettingsSection";

const READ_MODES: { value: ReadRoutingMode; label: string }[] = [
  { value: "outbox", label: "人ごとに選ぶ" },
  { value: "direct", label: "読み込みリレーだけ" },
];

/** 投稿を読むリレーの決め方。変えたらイベントを上へ渡す。 */
const ReadRoutingView: Component<{
  mode: ReadRoutingMode;
  entries: readonly RelayListEntry[];
  loading: boolean;
  fallback: readonly RelayUrl[];
}> = (props) => {
  const dispatch = useDispatch();
  const routing = () =>
    readRoutingFor(
      props.mode,
      props.loading
        ? { phase: "loading" }
        : props.entries.length > 0
          ? { phase: "ready", entries: props.entries }
          : { phase: "missing" },
      props.fallback,
    );
  const directRelays = () => {
    const current = routing();
    return current.mode === "direct" ? current.relays : [];
  };
  const usesFallback = () =>
    !props.loading && !props.entries.some((entry) => entry.read);

  return (
    <SettingsSection
      id="readRouting"
      scope="device"
      description="ふつうは、フォローしている人ごとに、その人が書き込みに使っているリレーを探して投稿を読みます。その人のリレーの設定が見つからないと、決まったリレーから読むので、手元で動かしているリレーや、限られた人だけのリレーにある投稿は出ないことがあります。「読み込みリレーだけ」にすると、誰の投稿も、「使うリレー」で「読み込み」にしたリレーから読みます。"
    >
      <SegmentedControl
        label="投稿を読むリレー"
        variant="secondary"
        value={props.mode}
        options={READ_MODES}
        onChange={(mode) => dispatch({ type: "deck/set-read-routing", mode })}
      />
      <Show when={props.mode === "direct"}>
        <div class="c-secondary rounded-2 border border-primary p-3 text-caption">
          <Switch>
            <Match when={props.loading}>読み込み中…</Match>
            <Match when={true}>
              {usesFallback()
                ? "読み込みにしたリレーが無いので、いまは次のリレーから読んでいます。"
                : "いまは次のリレーから読んでいます。"}
              <For each={directRelays()}>
                {(url) => (
                  <span class="c-primary block break-all">
                    {relayLabel(url)}
                  </span>
                )}
              </For>
            </Match>
          </Switch>
        </div>
      </Show>
    </SettingsSection>
  );
};

export default ReadRoutingView;
