import { type Component, Show } from "solid-js";
import AccountSettingsView from "./AccountSettingsView";
import { useProfileEdit } from "./ProfileMediator";

/** アカウントの設定のページ。書きかけと保存は `ProfileMediator` が持つ。 */
const AccountSettings: Component = () => {
  const edit = useProfileEdit();
  return (
    <Show when={edit}>
      {(edit) => (
        <AccountSettingsView
          pubkey={edit().pubkey}
          state={edit().state}
          attention={edit().attention()}
        />
      )}
    </Show>
  );
};

export default AccountSettings;
