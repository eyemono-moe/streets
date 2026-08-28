import type { Component } from "solid-js";
import { useOptionalMuteList } from "./mute-list";
import LabSettingsPage from "./settings/LabSettingsPage";
import MuteSettingsPage from "./settings/MuteSettingsPage";
import RelaySettingsPage from "./settings/RelaySettingsPage";
import SettingsShell, {
  type SettingsPageDefinition,
} from "./settings/SettingsShell";

type SettingsDialogProps = {
  onClose(): void;
};

/**
 * 設定画面の外部 interface。呼び出し側へ設定値や保存 handler を漏らさず、
 * 利用できるページと各 context の配線を内側へ閉じる。
 */
const SettingsDialog: Component<SettingsDialogProps> = (props) => {
  const muteList = useOptionalMuteList();
  const pages: SettingsPageDefinition[] = [
    { value: "relays", label: "リレー", content: <RelaySettingsPage /> },
    ...(muteList
      ? [
          {
            value: "mutes",
            label: "ミュート",
            content: <MuteSettingsPage />,
          },
        ]
      : []),
    { value: "lab", label: "ラボ", content: <LabSettingsPage /> },
  ];

  return <SettingsShell pages={pages} onClose={props.onClose} />;
};

export default SettingsDialog;
