import { describe, expect, it } from "vite-plus/test";
import { loadColumnStretch, saveColumnStretch } from "./column-stretch-setting";

describe("カラムを画面の幅いっぱいに広げる設定", () => {
  it("保存していなければ広げない", () => {
    expect(loadColumnStretch(null)).toBe(false);
  });

  it("読めない値は広げない（既定に倒す）", () => {
    expect(loadColumnStretch("よくわからない値")).toBe(false);
  });

  it("保存した値は読み戻せる", () => {
    expect(loadColumnStretch(saveColumnStretch(true))).toBe(true);
    expect(loadColumnStretch(saveColumnStretch(false))).toBe(false);
  });
});
