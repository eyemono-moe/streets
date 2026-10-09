import { describe, expect, it } from "vite-plus/test";
import { loadTimeFormat } from "./time-format-setting";

describe("投稿の時刻の見せ方の設定", () => {
  it("保存していなければ出した時刻にする", () => {
    expect(loadTimeFormat(null)).toBe("absolute");
  });

  it("相対時間を選んだときだけ相対時間にする", () => {
    expect(loadTimeFormat("relative")).toBe("relative");
    expect(loadTimeFormat("absolute")).toBe("absolute");
  });

  it("読めない値は出した時刻にする", () => {
    expect(loadTimeFormat("よくわからない値")).toBe("absolute");
  });
});
