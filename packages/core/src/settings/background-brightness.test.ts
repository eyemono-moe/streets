import { describe, expect, it } from "vite-plus/test";
import {
  backgroundLift,
  formatBackgroundBrightness,
  loadBackgroundBrightness,
} from "./background-brightness";

describe("loadBackgroundBrightness", () => {
  it("ダークは明るくする向き、ライトは暗くする向きの値を読む", () => {
    expect(loadBackgroundBrightness("dark", "0.07")).toBe(0.07);
    expect(loadBackgroundBrightness("dark", "0.3")).toBe(0.3);
    expect(loadBackgroundBrightness("light", "-0.12")).toBe(-0.12);
    expect(loadBackgroundBrightness("light", "-0.15")).toBe(-0.15);
  });

  it("1% 刻みの間の値は近い刻みに丸める", () => {
    expect(loadBackgroundBrightness("dark", "0.074")).toBe(0.07);
    expect(loadBackgroundBrightness("light", "-0.126")).toBe(-0.13);
  });

  it("そのテーマで取れない向きの値は標準にする", () => {
    expect(loadBackgroundBrightness("dark", "-0.1")).toBe(0);
    expect(loadBackgroundBrightness("light", "0.1")).toBe(0);
  });

  it("未保存・読めない値・範囲外は標準にする", () => {
    expect(loadBackgroundBrightness("dark", null)).toBe(0);
    expect(loadBackgroundBrightness("dark", "")).toBe(0);
    expect(loadBackgroundBrightness("dark", "bright")).toBe(0);
    expect(loadBackgroundBrightness("dark", "0.5")).toBe(0);
    expect(loadBackgroundBrightness("light", "-0.2")).toBe(0);
  });

  it("-0 は 0 として読む", () => {
    expect(Object.is(loadBackgroundBrightness("light", "-0"), 0)).toBe(true);
    expect(Object.is(loadBackgroundBrightness("light", "-0.001"), 0)).toBe(
      true,
    );
  });
});

describe("backgroundLift", () => {
  it("寄せる割合は向きによらず大きさだけ", () => {
    expect(backgroundLift(0.15)).toBe(0.15);
    expect(backgroundLift(-0.15)).toBe(0.15);
    expect(backgroundLift(0)).toBe(0);
  });
});

describe("formatBackgroundBrightness", () => {
  it("標準は「標準」、それ以外は明るさの変化を符号付きの割合で書く", () => {
    expect(formatBackgroundBrightness(0)).toEqual({
      key: "display.backgroundBrightness.standard",
    });
    expect(formatBackgroundBrightness(0.12)).toBe("+12%");
    expect(formatBackgroundBrightness(-0.07)).toBe("-7%");
  });
});
