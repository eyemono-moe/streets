import type { Component } from "solid-js";
import { t } from "../i18n/locale";
import { useDispatch } from "../ui-events";
import Switch from "../ui/Switch";
import SettingsSection from "./SettingsSection";

/** 外へ何を出すかの設定。今の値を受け取って描き、変えたらイベントを上へ渡す。 */
const PrivacySettings: Component<{
  /** 投稿に、Streets から投稿したことを示す印を付けるか（アカウントの設定）。 */
  clientTag: boolean;
  /** 引用した先の作者に知らせるか（アカウントの設定）。 */
  notifyQuoted: boolean;
  /** 不具合の報告を送るか（この端末の設定）。 */
  errorReport: boolean;
}> = (props) => {
  const dispatch = useDispatch();
  return (
    <div class="flex flex-col gap-7">
      <SettingsSection
        id="clientTag"
        scope="account"
        description={t("settings.privacy.clientTag.description")}
      >
        <Switch
          label={t("settings.privacy.clientTag.switch")}
          checked={props.clientTag}
          onChange={(on) => dispatch({ type: "deck/set-client-tag", on })}
        />
      </SettingsSection>

      <SettingsSection
        id="notifyQuoted"
        scope="account"
        changed={!props.notifyQuoted}
        onReset={() => dispatch({ type: "deck/set-notify-quoted", on: true })}
        description={t("settings.privacy.notifyQuoted.description")}
      >
        <Switch
          label={t("settings.privacy.notifyQuoted.switch")}
          checked={props.notifyQuoted}
          onChange={(on) => dispatch({ type: "deck/set-notify-quoted", on })}
        />
      </SettingsSection>

      <SettingsSection
        id="errorReport"
        scope="device"
        description={t("settings.privacy.errorReport.description")}
      >
        <Switch
          label={t("settings.privacy.errorReport.switch")}
          checked={props.errorReport}
          onChange={(on) => dispatch({ type: "deck/set-error-report", on })}
        />
      </SettingsSection>
    </div>
  );
};

export default PrivacySettings;
