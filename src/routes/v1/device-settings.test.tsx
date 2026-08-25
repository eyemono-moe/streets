import { createRoot } from "solid-js";
import { describe, expect, it } from "vitest";
import { DEVELOPER_MODE_STORAGE_KEY } from "../../core/settings/developer-mode";
import { createDeviceSettings } from "./device-settings";

const createMemoryStorage = (initial?: string) => {
  const values = new Map<string, string>();
  if (initial !== undefined) values.set(DEVELOPER_MODE_STORAGE_KEY, initial);
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  };
};

describe("端末設定", () => {
  it("保存値を初期状態にし、切替をstateと保存先の両方へ反映する", () => {
    createRoot((dispose) => {
      const storage = createMemoryStorage("true");
      const settings = createDeviceSettings(storage);

      expect(settings.developerMode()).toBe(true);

      // 捕まえる変異: signalだけを更新して保存しない、または保存だけして
      // 現在の画面を更新しない。
      settings.toggleDeveloperMode();
      expect(settings.developerMode()).toBe(false);
      expect(storage.getItem(DEVELOPER_MODE_STORAGE_KEY)).toBe("false");

      dispose();
    });
  });
});
