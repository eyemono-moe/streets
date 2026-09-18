import { describe, expect, it } from "vitest";
import { loadWriteProgress, saveWriteProgress } from "./write-progress-setting";

describe("書き込みの進み具合を出すか", () => {
  it("保存していなければ出す", () => {
    expect(loadWriteProgress(null)).toBe(true);
  });

  it("保存した値を読み戻せる", () => {
    expect(loadWriteProgress(saveWriteProgress(false))).toBe(false);
    expect(loadWriteProgress(saveWriteProgress(true))).toBe(true);
  });
});
