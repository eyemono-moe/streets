import { describe, expect, it } from "vitest";
import { loadErrorReport, saveErrorReport } from "./error-report-setting";

describe("エラーの報告の設定", () => {
  it("保存していなければ送る", () => {
    expect(loadErrorReport(null)).toBe(true);
  });

  it("止めたときだけ送らない", () => {
    expect(loadErrorReport("off")).toBe(false);
    expect(loadErrorReport("on")).toBe(true);
  });

  it("読めない値は送る（既定に倒す）", () => {
    expect(loadErrorReport("よくわからない値")).toBe(true);
  });

  it("保存した値は読み戻せる", () => {
    expect(loadErrorReport(saveErrorReport(false))).toBe(false);
    expect(loadErrorReport(saveErrorReport(true))).toBe(true);
  });
});
