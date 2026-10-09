import { describe, expect, it } from "vite-plus/test";
import { loadUiContrast, UI_CONTRAST_FACTORS } from "./ui-contrast";

describe("loadUiContrast", () => {
  it("保存したコントラストを読む", () => {
    expect(loadUiContrast("low")).toBe("low");
    expect(loadUiContrast("normal")).toBe("normal");
    expect(loadUiContrast("high")).toBe("high");
  });

  it("未保存や読めない値は標準にする", () => {
    expect(loadUiContrast(null)).toBe("normal");
    expect(loadUiContrast("max")).toBe("normal");
  });
});

describe("UI_CONTRAST_FACTORS", () => {
  it("標準は倍率 1 で、低い・高いは標準をはさむ", () => {
    expect(UI_CONTRAST_FACTORS.normal).toBe(1);
    expect(UI_CONTRAST_FACTORS.low).toBeLessThan(1);
    expect(UI_CONTRAST_FACTORS.high).toBeGreaterThan(1);
  });
});
