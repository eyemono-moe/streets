import { expect, it } from "vite-plus/test";
import { specOf } from "./spec";
import { autoOutline, presetById, styleOfPreset } from "./style";
import { autoLayout } from "./text";

it("specOf は並べ方に見た目を当て、自動の縁取りを色に直す", () => {
  const preset = presetById("neon")!;
  expect(specOf(autoLayout("ええやん"), styleOfPreset(preset))).toEqual({
    lines: ["ええ", "やん"],
    shape: "square",
    fit: "stretch",
    align: "center",
    color: preset.color,
    outline: autoOutline(preset.color),
    outlineWidth: preset.outlineWidth,
    font: "rounded",
  });
});
