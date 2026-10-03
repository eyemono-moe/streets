import { describe, expect, it } from "vite-plus/test";
import { loopStrip } from "./strip-loop";

describe("loopStrip", () => {
  it("anchor を真ん中に置くように回す", () => {
    expect(loopStrip(["a", "b", "c", "d", "e"], "a")).toEqual([
      "d",
      "e",
      "a",
      "b",
      "c",
    ]);
    expect(loopStrip(["a", "b", "c", "d", "e"], "e")).toEqual([
      "c",
      "d",
      "e",
      "a",
      "b",
    ]);
  });

  it("偶数枚では右より左に 1 枚多く置く", () => {
    expect(loopStrip(["a", "b", "c", "d"], "a")).toEqual(["c", "d", "a", "b"]);
  });

  it("3 枚なら左右に 1 枚ずつ", () => {
    expect(loopStrip(["a", "b", "c"], "c")).toEqual(["b", "c", "a"]);
  });

  it("2 枚以下と、anchor が無いときは元の並び", () => {
    const two = ["a", "b"];
    expect(loopStrip(two, "a")).toBe(two);
    const ids = ["a", "b", "c"];
    expect(loopStrip(ids, undefined)).toBe(ids);
    expect(loopStrip(ids, "x")).toBe(ids);
  });
});
