import { describe, expect, it } from "vite-plus/test";
import { formatUiContrast, loadUiContrast } from "./ui-contrast";

describe("loadUiContrast", () => {
  it("保存した倍率を読む", () => {
    expect(loadUiContrast("0.8")).toBe(0.8);
    expect(loadUiContrast("1")).toBe(1);
    expect(loadUiContrast("1.2")).toBe(1.2);
  });

  it("刻みの間の値は近い刻みに丸める", () => {
    expect(loadUiContrast("1.07")).toBe(1.05);
    expect(loadUiContrast("0.93")).toBe(0.95);
  });

  it("未保存・読めない値・範囲外は標準にする", () => {
    expect(loadUiContrast(null)).toBe(1);
    expect(loadUiContrast("")).toBe(1);
    expect(loadUiContrast("high")).toBe(1);
    expect(loadUiContrast("NaN")).toBe(1);
    expect(loadUiContrast("0.5")).toBe(1);
    expect(loadUiContrast("3")).toBe(1);
  });
});

describe("formatUiContrast", () => {
  it("標準は「標準」、それ以外は標準からの差を割合で書く", () => {
    expect(formatUiContrast(1)).toBe("標準");
    expect(formatUiContrast(1.1)).toBe("+10%");
    expect(formatUiContrast(0.85)).toBe("-15%");
  });
});
