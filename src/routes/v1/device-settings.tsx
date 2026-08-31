import {
  type Accessor,
  type ParentComponent,
  createContext,
  createSignal,
  useContext,
} from "solid-js";
import {
  DEVELOPER_MODE_STORAGE_KEY,
  loadDeveloperMode,
  saveDeveloperMode,
} from "../../core/settings/developer-mode";

type DeviceSettingsStorage = Pick<Storage, "getItem" | "setItem">;

export type DeviceSettings = {
  developerMode: Accessor<boolean>;
  toggleDeveloperMode(): void;
};

/**
 * 端末設定の interface。保存形式と Solid state の同期を呼び出し側から隠す。
 * アカウント設定 (プロフィール等) は Nostr イベントとして扱うため混ぜない。
 */
export const createDeviceSettings = (
  storage: DeviceSettingsStorage,
): DeviceSettings => {
  const [developerMode, setDeveloperMode] = createSignal(
    loadDeveloperMode(storage.getItem(DEVELOPER_MODE_STORAGE_KEY)),
  );

  return {
    developerMode,
    toggleDeveloperMode() {
      const next = !developerMode();
      setDeveloperMode(next);
      storage.setItem(DEVELOPER_MODE_STORAGE_KEY, saveDeveloperMode(next));
    },
  };
};

const DeviceSettingsContext = createContext<DeviceSettings>();

export const DeviceSettingsProvider: ParentComponent<{
  value?: DeviceSettings;
}> = (props) => (
  <DeviceSettingsContext.Provider
    value={props.value ?? createDeviceSettings(window.localStorage)}
  >
    {props.children}
  </DeviceSettingsContext.Provider>
);

export const useDeviceSettings = (): DeviceSettings => {
  const settings = useContext(DeviceSettingsContext);
  if (!settings) {
    throw new Error("DeviceSettingsProvider の内側で使用してください");
  }
  return settings;
};
