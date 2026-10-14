import { describe, expect, it } from "vite-plus/test";
import {
  DEFAULT_READ_REDUNDANCY,
  loadReadRedundancy,
  saveReadRedundancy,
} from "./read-redundancy-setting";

describe("1 人あたりに読むリレーの数", () => {
  it("未保存なら 2 本", () => {
    expect(loadReadRedundancy(null)).toBe(2);
    expect(DEFAULT_READ_REDUNDANCY).toBe(2);
  });

  it("保存した本数を読み戻す", () => {
    for (const value of [1, 2, 3, 4] as const) {
      expect(loadReadRedundancy(saveReadRedundancy(value))).toBe(value);
    }
  });

  it("選べない本数や読めない値は既定に戻す", () => {
    for (const raw of ["0", "5", "2.5", "", "abc", "-1"]) {
      expect(loadReadRedundancy(raw)).toBe(2);
    }
  });
});
