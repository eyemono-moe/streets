import type { Component } from "solid-js";
import FileServerSettings from "../../features/FileServer/components/FileServerSettings";
import FileServerStatus from "../../features/FileServer/components/FileServerStatus";
import BasicLayout from "../../features/Settings/components/BasicLayout";
import { useI18n } from "../../i18n";
import HelpTooltip from "../../shared/components/HelpTooltip";

const file: Component = () => {
  const t = useI18n();

  return (
    <BasicLayout title={t("settings.file.title")} backTo="/settings">
      <div class="space-y-4">
        <div class="space-y-2">
          <h4 class="flex items-center gap-1 font-500 text-h3">
            {t("settings.file.serverToBeUsed")}
            <HelpTooltip>{t("settings.file.help")}</HelpTooltip>
          </h4>
          <FileServerSettings />
        </div>
        <div class="space-y-2">
          <h4 class="font-500 text-h3">
            {t("settings.relay.connectionStatus")}
          </h4>
          <FileServerStatus />
        </div>
      </div>
    </BasicLayout>
  );
};

export default file;
