import { describe, expect, it } from "vite-plus/test";
import { dropIndex, keepOrder, moveId } from "./sortable";

describe("moveId", () => {
  it("抜いて、入れた後の位置へ入れる", () => {
    expect(moveId(["a", "b", "c", "d"], "a", 2)).toEqual(["b", "c", "a", "d"]);
    expect(moveId(["a", "b", "c", "d"], "d", 0)).toEqual(["d", "a", "b", "c"]);
  });

  it("動かないときと、無い id は同じ配列を返す", () => {
    const ids = ["a", "b"];
    expect(moveId(ids, "a", 0)).toBe(ids);
    expect(moveId(ids, "x", 1)).toBe(ids);
  });

  it("端を越えた位置は端に収める", () => {
    expect(moveId(["a", "b", "c"], "a", 9)).toEqual(["b", "c", "a"]);
  });
});

describe("dropIndex", () => {
  // a:[0,100) b:[100,300) c:[300,400)
  const slots = [
    { id: "a", start: 0, size: 100 },
    { id: "b", start: 100, size: 200 },
    { id: "c", start: 300, size: 100 },
  ];

  it("ほかのものの中央を越えた数が、入る位置になる", () => {
    expect(dropIndex(slots, "a", 150)).toBe(0);
    expect(dropIndex(slots, "a", 250)).toBe(1);
    expect(dropIndex(slots, "a", 390)).toBe(2);
    expect(dropIndex(slots, "c", 10)).toBe(0);
  });

  it("入れ替わった後も、ポインタが同じなら同じ位置のまま（行き来しない）", () => {
    // a を b の中央（200）の先へ運ぶと b・a・c の並びになる。b は [0,200)、a は [200,300)。
    expect(dropIndex(slots, "a", 210)).toBe(1);
    const swapped = [
      { id: "b", start: 0, size: 200 },
      { id: "a", start: 200, size: 100 },
      { id: "c", start: 300, size: 100 },
    ];
    expect(dropIndex(swapped, "a", 210)).toBe(1);
  });
});

describe("keepOrder", () => {
  it("前の順を保ち、増えたものを後ろへ足す", () => {
    expect(keepOrder(["a", "b", "c"], ["c", "a", "d", "b"])).toEqual([
      "a",
      "b",
      "c",
      "d",
    ]);
  });

  it("消えたものを抜く", () => {
    expect(keepOrder(["a", "b", "c"], ["c", "a"])).toEqual(["a", "c"]);
  });

  it("顔ぶれが同じなら、前の配列をそのまま返す", () => {
    const previous = ["a", "b"];
    expect(keepOrder(previous, ["b", "a"])).toBe(previous);
  });
});
