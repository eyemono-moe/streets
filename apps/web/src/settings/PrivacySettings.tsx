import type { Component } from "solid-js";
import { useDispatch } from "../ui-events";
import Switch from "../ui/Switch";
import SettingsSection from "./SettingsSection";

/** 外へ何を出すかの設定。今の値を受け取って描き、変えたらイベントを上へ渡す。 */
const PrivacySettings: Component<{
  /** 投稿に、Streets から投稿したことを示す印を付けるか（アカウントの設定）。 */
  clientTag: boolean;
  /** 不具合の報告を送るか（この端末の設定）。 */
  errorReport: boolean;
}> = (props) => {
  const dispatch = useDispatch();
  return (
    <div class="flex flex-col gap-7">
      <SettingsSection
        title="投稿したアプリの表示"
        scope="account"
        description="投稿に、Streets から投稿したことを示す印を付けます。ほかのアプリでは「Streets から投稿」のように表示され、どのアプリを使っているかを誰でも見られるようになります。一度送った投稿からは、あとで外せません。"
      >
        <Switch
          label="投稿に Streets から投稿したことを示す"
          checked={props.clientTag}
          onChange={(on) => dispatch({ type: "deck/set-client-tag", on })}
        />
      </SettingsSection>

      <SettingsSection
        title="不具合と動作の速さの報告"
        scope="device"
        description="不具合が起きたときのエラーの内容と、画面の読み込みや操作にかかった時間を、端末・ブラウザの情報とあわせて開発元へ送信します。秘密鍵・公開鍵・イベント ID・投稿の本文は送信しません。"
      >
        <Switch
          label="不具合と動作の速さの報告を送信する"
          checked={props.errorReport}
          onChange={(on) => dispatch({ type: "deck/set-error-report", on })}
        />
      </SettingsSection>
    </div>
  );
};

export default PrivacySettings;
