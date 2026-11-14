import type { AppletAddress } from "@streets/core/napplet/library";
import { type Component, Show } from "solid-js";
import SettingField from "../deck/SettingField";
import StorageHint from "../ui/StorageHint";
import { appletConfig } from "./applet-config";
import AppletConfigForm from "./AppletConfigForm";

/**
 * アップレットのカラムの設定の下に、アップレットが宣言した設定（NAP-CONFIG）を並べる。
 * 一度も開いていない・宣言していないアップレットには何も出さない。
 */
const AppletConfigSettings: Component<{ source: AppletAddress }> = (props) => (
  <Show when={appletConfig.read(props.source)}>
    {(saved) => (
      <SettingField label="アップレットの設定">
        <div class="flex flex-col gap-3">
          <p class="c-secondary flex flex-wrap items-center gap-1 text-caption">
            アップレットが決めた項目です。
            <StorageHint scope="device" />
          </p>
          <AppletConfigForm
            schema={saved().schema}
            values={saved().values}
            onChange={(key, value) =>
              appletConfig.set(props.source, key, value)
            }
          />
        </div>
      </SettingField>
    )}
  </Show>
);

export default AppletConfigSettings;
