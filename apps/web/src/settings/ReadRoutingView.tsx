import type { RelayListEntry } from "@streets/core/read/relay-list";
import type { RelayUrl } from "@streets/core/relay/relay-connection";
import {
  type ReadRoutingMode,
  readRoutingFor,
} from "@streets/core/settings/read-routing-setting";
import { relayLabel } from "@streets/core/settings/relay-edit";
import { type Component, For, Match, Show, Switch } from "solid-js";
import { t } from "../i18n/locale";
import { useDispatch } from "../ui-events";
import SegmentedControl from "../ui/SegmentedControl";
import SettingsSection from "./SettingsSection";

const readModes = (): { value: ReadRoutingMode; label: string }[] => [
  { value: "outbox", label: t("settings.readRouting.outbox") },
  { value: "direct", label: t("settings.readRouting.direct") },
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
      description={t("settings.readRouting.description")}
    >
      <SegmentedControl
        label={t("settings.readRouting.label")}
        variant="secondary"
        value={props.mode}
        options={readModes()}
        onChange={(mode) => dispatch({ type: "deck/set-read-routing", mode })}
      />
      <Show when={props.mode === "direct"}>
        <div class="c-secondary rounded-2 border border-primary p-3 text-caption">
          <Switch>
            <Match when={props.loading}>{t("settings.relays.loading")}</Match>
            <Match when={true}>
              {usesFallback()
                ? t("settings.readRouting.readingFallback")
                : t("settings.readRouting.reading")}
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
