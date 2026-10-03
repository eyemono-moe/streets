import { describe, expect, it } from "vite-plus/test";
import { defaultActionLayout } from "./action-layout";
import {
  defaultDisplaySettings,
  defaultKeyboardSettings,
  isDefaultDisplay,
  isDefaultKeyboard,
} from "./device-defaults";

describe("表示の既定", () => {
  it("何も保存していないときの値と同じ", () => {
    expect(defaultDisplaySettings()).toEqual({
      deckLayout: "auto",
      writeProgress: true,
      contentWarning: "hide",
      actionLayout: defaultActionLayout(),
      colorScheme: "system",
    });
  });

  it("呼ぶたびに別のものを返す", () => {
    expect(defaultDisplaySettings().actionLayout).not.toBe(
      defaultDisplaySettings().actionLayout,
    );
  });

  it("1 つでも変えていれば既定ではない", () => {
    expect(isDefaultDisplay(defaultDisplaySettings())).toBe(true);
    expect(
      isDefaultDisplay({ ...defaultDisplaySettings(), colorScheme: "dark" }),
    ).toBe(false);
    const moved = defaultActionLayout();
    expect(
      isDefaultDisplay({
        ...defaultDisplaySettings(),
        actionLayout: { bar: [...moved.bar].reverse(), menu: moved.menu },
      }),
    ).toBe(false);
  });
});

describe("キーボードの既定", () => {
  it("キーを 1 つでも変えていれば既定ではない", () => {
    const initial = defaultKeyboardSettings();
    expect(isDefaultKeyboard(initial)).toBe(true);
    expect(
      isDefaultKeyboard({
        ...initial,
        keymap: { ...initial.keymap, compose: "" },
      }),
    ).toBe(false);
    expect(isDefaultKeyboard({ ...initial, columnDigits: false })).toBe(false);
  });
});
