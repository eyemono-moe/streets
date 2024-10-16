import { type Component, For } from "solid-js";
import { useRelays } from "../../context/relays";
import RelayDetail from "../../features/Relay/components/RelayDetail";
import RelaySettings from "../../features/Relay/components/RelaySettings";
import BasicLayout from "../../features/Settings/components/BasicLayout";
import { useI18n } from "../../i18n";
import HelpTooltip from "../../shared/components/HelpTooltip";

const relay: Component = () => {
  const t = useI18n();
  const [relays] = useRelays();

  return (
    <BasicLayout title={t("settings.relay.title")} backTo="/settings">
      <div class="space-y-4">
        <div class="space-y-2">
          <h4 class="flex items-center gap-1 font-500 text-lg">
            {t("settings.relay.relayToBeUsed")}
            <HelpTooltip>{t("settings.relay.relayHelp")}</HelpTooltip>
          </h4>
          <RelaySettings />
        </div>
        <div class="space-y-2">
          <h4 class="font-500 text-lg">
            {t("settings.relay.connectionStatus")}
          </h4>
          <div class="space-y-1">
            <For each={Object.entries(relays.defaultRelays)}>
              {([relay]) => <RelayDetail relay={relay} />}
            </For>
          </div>
        </div>
      </div>
    </BasicLayout>
  );
};

export default relay;
