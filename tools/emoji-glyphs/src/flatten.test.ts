import type { PathCommand } from "opentype.js";
import { describe, expect, it } from "vite-plus/test";
import { charset, flatten } from "./flatten";

describe("flatten", () => {
  it("直線だけの輪郭は、角の点だけになる（始点に戻る点は持たない）", () => {
    const commands: PathCommand[] = [
      { type: "M", x: 0, y: 0 },
      { type: "L", x: 100, y: 0 },
      { type: "L", x: 100, y: 100 },
      { type: "L", x: 0, y: 100 },
      { type: "L", x: 0, y: 0 },
      { type: "Z" },
    ];
    expect(flatten(commands)).toEqual([[0, 0, 100, 0, 100, 100, 0, 100]]);
  });

  it("曲線は、元の曲線から 1 単位より離れない折れ線になる", () => {
    const commands: PathCommand[] = [
      { type: "M", x: 0, y: 0 },
      { type: "Q", x1: 500, y1: 1000, x: 1000, y: 0 },
      { type: "Z" },
    ];
    const [points = []] = flatten(commands);
    // 2 次曲線の頂点は (500, 500)。折れ線の点はどれも曲線の上（丸めの 0.5 以内）にある。
    for (let i = 0; i < points.length; i += 2) {
      const x = points[i] ?? 0;
      const y = points[i + 1] ?? 0;
      const t = x / 1000;
      expect(Math.abs(y - 2 * t * (1 - t) * 1000)).toBeLessThanOrEqual(1);
    }
    expect(points.length / 2).toBeGreaterThan(10);
  });

  it("面を持たない輪郭は捨てる", () => {
    const commands: PathCommand[] = [
      { type: "M", x: 0, y: 0 },
      { type: "L", x: 100, y: 0 },
      { type: "Z" },
    ];
    expect(flatten(commands)).toEqual([]);
  });
});

it("charset は JIS 第 1・第 2 水準・かな・記号・ASCII を含む", () => {
  const set = new Set(charset());
  for (const ch of ["A", "あ", "ア", "亜", "麒", "鬱", "ｗ", "。"]) {
    expect(set.has(ch.codePointAt(0) ?? 0)).toBe(true);
  }
  expect(set.has("🍣".codePointAt(0) ?? 0)).toBe(false);
});
