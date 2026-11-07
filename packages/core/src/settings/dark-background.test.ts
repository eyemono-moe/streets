import { describe, expect, it } from "vite-plus/test";
import { formatDarkBackground, loadDarkBackground } from "./dark-background";

describe("loadDarkBackground", () => {
  it("保存した割合を読む", () => {
    expect(loadDarkBackground("0")).toBe(0);
    expect(loadDarkBackground("0.15")).toBe(0.15);
    expect(loadDarkBackground("0.3")).toBe(0.3);
  });

  it("刻みの間の値は近い刻みに丸める", () => {
    expect(loadDarkBackground("0.07")).toBe(0.05);
    expect(loadDarkBackground("0.13")).toBe(0.15);
  });

  it("未保存・読めない値・範囲外は標準（今の黒）にする", () => {
    expect(loadDarkBackground(null)).toBe(0);
    expect(loadDarkBackground("")).toBe(0);
    expect(loadDarkBackground("light")).toBe(0);
    expect(loadDarkBackground("NaN")).toBe(0);
    expect(loadDarkBackground("-0.1")).toBe(0);
    expect(loadDarkBackground("0.5")).toBe(0);
  });
});

describe("formatDarkBackground", () => {
  it("標準は「標準」、それ以外は寄せた割合を書く", () => {
    expect(formatDarkBackground(0)).toEqual({
      key: "display.darkBackground.standard",
    });
    expect(formatDarkBackground(0.1)).toBe("+10%");
    expect(formatDarkBackground(0.3)).toBe("+30%");
  });
});
