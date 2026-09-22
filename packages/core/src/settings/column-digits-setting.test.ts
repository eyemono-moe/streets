import { describe, expect, it } from "vitest";
import { loadColumnDigits, saveColumnDigits } from "./column-digits-setting";

describe("数字キーでカラムを見せる設定", () => {
  it("保存していなければ使う", () => {
    expect(loadColumnDigits(null)).toBe(true);
  });

  it("止めたときだけ使わない", () => {
    expect(loadColumnDigits("off")).toBe(false);
    expect(loadColumnDigits("on")).toBe(true);
  });

  it("読めない値は使う（既定に倒す）", () => {
    expect(loadColumnDigits("よくわからない値")).toBe(true);
  });

  it("保存した値は読み戻せる", () => {
    expect(loadColumnDigits(saveColumnDigits(false))).toBe(false);
    expect(loadColumnDigits(saveColumnDigits(true))).toBe(true);
  });
});
