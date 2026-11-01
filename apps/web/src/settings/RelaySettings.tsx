import { OUTBOX_RELAY_BUDGET } from "@streets/core/read/default-relays";
import { type Component, Show, createSignal, onCleanup } from "solid-js";
import {
  customFallbackRelays,
  fallbackRelays,
} from "../fallback-relay-setting";
import { t } from "../i18n/locale";
import { readRedundancy } from "../read-redundancy-setting";
import { readRoutingMode } from "../read-routing-setting";
import { useRelayFailures } from "../relay-failures";
import { useBlockedRelays } from "./BlockedRelayMediator";
import BlockedRelaysView from "./BlockedRelaysView";
import FallbackRelaysView from "./FallbackRelaysView";
import ReadRedundancyView from "./ReadRedundancyView";
import ReadRoutingView from "./ReadRoutingView";
import { useRelayEdit } from "./RelayMediator";
import RelayRecommendations from "./RelayRecommendations";
import RelaySettingsView from "./RelaySettingsView";
import SettingsDetails from "./SettingsDetails";

/**
 * 接続の様子を見直す間隔。つながった・切れたの通知はプールに無いので、
 * このページを開いている間だけ見に行く。
 */
const STATUS_POLL_MS = 2000;

/** リレーの設定のページ。書きかけと保存は `RelayMediator` が持つ。 */
const RelaySettings: Component = () => {
  const edit = useRelayEdit();
  const blocked = useBlockedRelays();
  const failures = useRelayFailures();
  const [tick, setTick] = createSignal(0);
  const interval = setInterval(() => setTick((n) => n + 1), STATUS_POLL_MS);
  onCleanup(() => clearInterval(interval));

  return (
    <Show when={edit}>
      {(edit) => (
        <div class="flex flex-col gap-7">
          <RelaySettingsView
            entries={edit().entries()}
            loading={edit().loading()}
            allows={edit().allows}
            statusOf={(url) => {
              tick();
              return edit().statusOf(url);
            }}
            fallback={fallbackRelays()}
            infoOf={edit().infoOf}
          />
          <Show when={blocked}>
            {(blocked) => (
              <BlockedRelaysView
                entries={blocked().entries()}
                privatePart={blocked().privatePart()}
                saving={blocked().saving()}
                account={edit().entries()}
                failures={failures()}
              />
            )}
          </Show>
          <RelayRecommendations edit={edit()} />
          <SettingsDetails
            page="relays"
            summary={t("settings.relays.detailsSummary")}
          >
            <ReadRoutingView
              mode={readRoutingMode()}
              entries={edit().entries()}
              loading={edit().loading()}
              fallback={fallbackRelays()}
            />
            <Show when={readRoutingMode() === "outbox"}>
              <ReadRedundancyView
                value={readRedundancy()}
                relayCount={edit().readPlan?.().relays.length}
                preview={(redundancy) => {
                  // 見込みは購読から数えるので、読み取り先が変わるたびに数え直す。
                  edit().readPlan?.();
                  return edit().previewRelayCount?.(redundancy) ?? 0;
                }}
                budget={OUTBOX_RELAY_BUDGET}
                budgetReached={edit().readPlan?.().budgetReached ?? false}
              />
            </Show>
            <FallbackRelaysView
              relays={customFallbackRelays()}
              candidates={edit().entries()}
            />
          </SettingsDetails>
        </div>
      )}
    </Show>
  );
};

export default RelaySettings;
