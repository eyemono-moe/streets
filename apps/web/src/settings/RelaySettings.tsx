import { FALLBACK_RELAYS } from "@streets/core/read/default-relays";
import { type Component, Show, createSignal, onCleanup } from "solid-js";
import { readRoutingMode } from "../read-routing-setting";
import { useBlockedRelays } from "./BlockedRelayMediator";
import BlockedRelaysView from "./BlockedRelaysView";
import ReadRoutingView from "./ReadRoutingView";
import { useRelayEdit } from "./RelayMediator";
import RelayPlanView from "./RelayPlanView";
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
            fallback={FALLBACK_RELAYS}
            infoOf={edit().infoOf}
          />
          <Show when={blocked}>
            {(blocked) => (
              <BlockedRelaysView
                entries={blocked().entries()}
                privatePart={blocked().privatePart()}
                saving={blocked().saving()}
                account={edit().entries()}
              />
            )}
          </Show>
          <RelayRecommendations edit={edit()} />
          <SettingsDetails
            page="relays"
            summary="投稿を読むリレーの決め方と、いまつないでいるリレーの一覧"
          >
            <ReadRoutingView
              mode={readRoutingMode()}
              entries={edit().entries()}
              loading={edit().loading()}
              fallback={FALLBACK_RELAYS}
            />
            <RelayPlanView
              plan={edit().readPlan?.()}
              routingSettled={edit().routingSettled?.() ?? true}
              entries={edit().entries()}
              loading={edit().loading()}
              fallback={FALLBACK_RELAYS}
              statusOf={(url) => {
                tick();
                return edit().statusOf(url);
              }}
              infoOf={edit().infoOf}
            />
          </SettingsDetails>
        </div>
      )}
    </Show>
  );
};

export default RelaySettings;
