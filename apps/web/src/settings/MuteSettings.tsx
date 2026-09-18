import { type Component, Show } from "solid-js";
import { useMutes } from "./MuteMediator";
import MuteSettingsView from "./MuteSettingsView";

/** ミュートの設定のページ。一覧・書きかけ・保存は `MuteMediator` が持つ。 */
const MuteSettings: Component = () => {
  const mutes = useMutes();
  return (
    <Show when={mutes}>
      {(mutes) => (
        <MuteSettingsView
          entries={mutes().entries()}
          loading={mutes().loading()}
          privatePart={mutes().privatePart()}
        />
      )}
    </Show>
  );
};

export default MuteSettings;
