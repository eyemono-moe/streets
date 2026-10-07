import { describe, expect, it } from "vite-plus/test";
import {
  PICKER_PRESET_IDS,
  PRESETS,
  autoOutline,
  presetById,
  resolveOutline,
  sameStyle,
  styleOfPreset,
} from "./style";

describe("autoOutline", () => {
  it("明るい文字には暗い縁、暗い文字には白い縁", () => {
    expect(autoOutline("#ffffff")).toBe("#1b1b1f");
    expect(autoOutline("#ffd43b")).toBe("#1b1b1f");
    expect(autoOutline("#222226")).toBe("#ffffff");
    expect(autoOutline("#e5383b")).toBe("#ffffff");
  });

  it("桃色（ゆる）には暗い縁が付く（白い縁は明るい背景で消える）", () => {
    expect(autoOutline("#ff8fb8")).toBe("#1b1b1f");
  });
});

it("ピッカーの 3 つはプリセットの中にある", () => {
  for (const id of PICKER_PRESET_IDS) expect(presetById(id)).toBeDefined();
});

it("プリセットの縁取りは自動", () => {
  for (const preset of PRESETS) {
    expect(styleOfPreset(preset).outline).toBe("auto");
  }
});

it("resolveOutline と sameStyle", () => {
  const style = styleOfPreset(PRESETS[0]!);
  expect(resolveOutline(style)).toBe(autoOutline(style.color));
  expect(resolveOutline({ ...style, outline: null })).toBeNull();
  expect(sameStyle(style, { ...style })).toBe(true);
  expect(sameStyle(style, { ...style, font: "serif" })).toBe(false);
});
