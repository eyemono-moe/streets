import { describe, expect, it } from "vite-plus/test";
import {
  loadSettingsDetailsOpen,
  saveSettingsDetailsOpen,
  settingsDetailsStorageKey,
} from "./settings-details";

describe("設定の「詳しく」の開閉", () => {
  it("保存した開閉を読み戻す", () => {
    expect(loadSettingsDetailsOpen(saveSettingsDetailsOpen(true))).toBe(true);
    expect(loadSettingsDetailsOpen(saveSettingsDetailsOpen(false))).toBe(false);
  });

  it("保存していない・読めない値は閉じている", () => {
    expect(loadSettingsDetailsOpen(null)).toBe(false);
    expect(loadSettingsDetailsOpen("yes")).toBe(false);
  });

  it("ページごとに別の置き場を使う", () => {
    expect(settingsDetailsStorageKey("relays")).not.toBe(
      settingsDetailsStorageKey("display"),
    );
  });
});
