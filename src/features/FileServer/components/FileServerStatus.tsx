import { type Component, Match, Show, Switch } from "solid-js";
import { useFileServer } from "../../../context/fileServer";
import { useI18n } from "../../../i18n";

const FileServerStatus: Component = () => {
  const t = useI18n();

  const [, serverConfig] = useFileServer();

  return (
    <div class="b-1 rounded p-2">
      <Switch
        fallback={
          <div class="flex items-center gap-1">
            <div class="i-material-symbols:circle c-gray aspect-square h-1lh w-auto" />
            {t("loading")}
          </div>
        }
      >
        <Match when={serverConfig.state === "ready"}>
          <div class="flex items-center gap-1">
            <div class="i-material-symbols:check-circle-rounded c-green aspect-square h-1lh w-auto" />
            {t("settings.file.serverStatus.ready")}
          </div>
          <ul>
            <Show when={serverConfig()?.tos_url}>
              <li>
                {t("settings.file.termOfService")}:
                <a href={serverConfig()?.tos_url} class="text-link">
                  {serverConfig()?.tos_url}
                </a>
              </li>
            </Show>
            <li>
              {t("settings.file.availableFileType")}:
              {serverConfig()?.content_types?.join(", ")}
            </li>
          </ul>
        </Match>
        <Match when={serverConfig.state === "errored"}>
          <div class="flex items-center gap-1">
            <div class="i-material-symbols:error-circle-rounded c-red aspect-square h-1lh w-auto" />
            {t("settings.file.serverStatus.errored")}
          </div>
          {t("settings.file.checkServerUrl")}
        </Match>
      </Switch>
    </div>
  );
};

export default FileServerStatus;
