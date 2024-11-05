import type { Component } from "solid-js";
import { useFileServer } from "../../context/fileServer";
import FileServerSettings from "../../features/FileServer/components/FileServerSettings";
import FileServerStatus from "../../features/FileServer/components/FileServerStatus";
import BasicLayout from "../../features/Settings/components/BasicLayout";
import { useI18n } from "../../i18n";
import HelpTooltip from "../../shared/components/HelpTooltip";

const file: Component = () => {
  const t = useI18n();
  const [fileServer] = useFileServer();

  return (
    <BasicLayout title={t("settings.file.title")} backTo="/settings">
      <div class="space-y-4">
        <div class="space-y-2">
          <h4 class="flex items-center gap-1 font-500 text-h3">
            {t("settings.relay.relayToBeUsed")}
            <HelpTooltip>{t("settings.relay.relayHelp")}</HelpTooltip>
          </h4>
          <FileServerSettings />
        </div>
        <div class="space-y-2">
          <h4 class="font-500 text-h3">
            {t("settings.relay.connectionStatus")}
          </h4>
          <FileServerStatus apiUrl={fileServer.selectedApiURL} />
        </div>
      </div>
    </BasicLayout>
  );
};

export default file;
