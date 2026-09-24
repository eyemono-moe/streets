import { describe, expect, it } from "vitest";
import { agoSeconds, parseBaseTime, resolveTime } from "./time";

describe("time", () => {
  it("単位ごとに秒へ直す", () => {
    expect(agoSeconds("45s")).toBe(45);
    expect(agoSeconds("2m")).toBe(120);
    expect(agoSeconds("3h")).toBe(10_800);
    expect(agoSeconds("1d")).toBe(86_400);
  });

  it("単位を続けて書ける", () => {
    expect(agoSeconds("1h30m")).toBe(5_400);
  });

  it("ago は基準時刻より前、offset は基準時刻からの秒", () => {
    expect(resolveTime(1_000, { ago: "2m" })).toBe(880);
    expect(resolveTime(1_000, { offset: -30 })).toBe(970);
  });

  it("--time を UNIX 秒にする", () => {
    expect(parseBaseTime("2026-09-23T19:00:00+09:00")).toBe(1_790_157_600);
  });

  it("読めない時刻は止める", () => {
    expect(() => parseBaseTime("きのう")).toThrow();
  });
});
