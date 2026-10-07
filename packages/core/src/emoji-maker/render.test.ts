import { describe, expect, it } from "vite-plus/test";
import type { FontId, Glyph } from "./glyph-shard";
import {
  EMOJI_HEIGHT,
  type GlyphLookup,
  missingChars,
  outlineMask,
  place,
  rasterize,
  renderEmoji,
  shardsFor,
  widthOf,
} from "./render";
import type { EmojiSpec } from "./spec";

const square = (x0: number, y0: number, x1: number, y1: number) =>
  new Float32Array([x0, y0, x1, y0, x1, y1, x0, y1]);

/** 1000 単位の枠いっぱいの四角い字。 */
const box: Glyph = {
  advance: 1000,
  box: [0, -1000, 1000, 0],
  contours: [new Int16Array([0, -1000, 1000, -1000, 1000, 0, 0, 0])],
};

/** ゴシックには A と B、丸ゴシックには A だけ、明朝には A だけがある。 */
const fonts: Record<FontId, Record<string, Glyph>> = {
  gothic: { A: box, B: box },
  rounded: { A: box },
  serif: { A: box },
};
const lookup: GlyphLookup = (font, codePoint) =>
  fonts[font][String.fromCodePoint(codePoint)];

const spec = (over: Partial<EmojiSpec> = {}): EmojiSpec => ({
  lines: ["A"],
  shape: "square",
  fit: "stretch",
  align: "center",
  color: "#ff0000",
  outline: null,
  outlineWidth: 0,
  font: "gothic",
  ...over,
});

const at = (cov: Float32Array, width: number, x: number, y: number) =>
  cov[y * width + x] ?? Number.NaN;

describe("rasterize", () => {
  it("画素の境目に沿った四角は、中が 1・外が 0", () => {
    const cov = rasterize([square(2, 2, 6, 6)], 10, 10);
    expect(at(cov, 10, 3, 3)).toBeCloseTo(1);
    expect(at(cov, 10, 1, 3)).toBeCloseTo(0);
    expect(at(cov, 10, 6, 3)).toBeCloseTo(0);
    expect(cov.reduce((sum, v) => sum + v, 0)).toBeCloseTo(16);
  });

  it("画素の半分にかかる縁は 0.5", () => {
    const cov = rasterize([square(2.5, 2, 6.5, 6)], 10, 10);
    expect(at(cov, 10, 2, 3)).toBeCloseTo(0.5);
    expect(at(cov, 10, 6, 3)).toBeCloseTo(0.5);
  });

  it("逆向きの輪郭は穴になり、同じ向きで重なったところは 1 で打ち止め", () => {
    const hole = new Float32Array([4, 4, 4, 6, 6, 6, 6, 4]);
    const withHole = rasterize([square(2, 2, 8, 8), hole], 10, 10);
    expect(at(withHole, 10, 5, 5)).toBeCloseTo(0);
    expect(at(withHole, 10, 3, 3)).toBeCloseTo(1);
    const overlap = rasterize([square(2, 2, 6, 6), square(4, 4, 8, 8)], 10, 10);
    expect(at(overlap, 10, 5, 5)).toBeCloseTo(1);
  });
});

it("outlineMask は、字から半径までを塗る", () => {
  const cov = rasterize([square(10, 10, 20, 20)], 30, 30);
  const mask = outlineMask(cov, 30, 30, 3);
  expect(at(mask, 30, 15, 15)).toBeCloseTo(1);
  expect(at(mask, 30, 21, 15)).toBeCloseTo(1); // 縁から 1 画素
  expect(at(mask, 30, 26, 15)).toBeCloseTo(0); // 縁から 6 画素
});

describe("描けない字", () => {
  it("どの書体にも無い字を返す", () => {
    expect(missingChars(spec({ lines: ["A?", "?"] }), lookup)).toEqual(["?"]);
    expect(place(spec({ lines: ["A?"] }), lookup)).toBeUndefined();
  });

  it("丸ゴシックに無い字はゴシックで補い、明朝は補わない", () => {
    expect(
      missingChars(spec({ lines: ["B"], font: "rounded" }), lookup),
    ).toEqual([]);
    expect(missingChars(spec({ lines: ["B"], font: "serif" }), lookup)).toEqual(
      ["B"],
    );
  });

  it("絵文字の組み合わせは輪郭を持たない", () => {
    expect(missingChars(spec({ lines: ["A👨‍👩‍👧"] }), lookup)).toEqual(["👨‍👩‍👧"]);
  });

  it("読んでおくファイルに、補う書体の分も入れる", () => {
    expect(shardsFor({ lines: ["A"], font: "rounded" })).toEqual([
      { font: "rounded", name: "1" },
      { font: "gothic", name: "1" },
    ]);
  });
});

const bounds = (contours: Float32Array[]) => {
  const xs = contours.flatMap((c) => [...c].filter((_, i) => i % 2 === 0));
  const ys = contours.flatMap((c) => [...c].filter((_, i) => i % 2 === 1));
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
};

describe("place", () => {
  it("伸ばすときは、縁取りの分を空けて枠いっぱいに広げる", () => {
    const placed = place(spec({ outline: "#000000", outlineWidth: 6 }), lookup);
    const pad = 6 + 2;
    expect(bounds(placed?.contours ?? [])).toEqual([
      pad,
      pad,
      EMOJI_HEIGHT - pad,
      EMOJI_HEIGHT - pad,
    ]);
  });

  it("保つときは、行どうしで同じ倍率にして左に寄せる", () => {
    const placed = place(
      spec({ lines: ["AA", "A"], fit: "keep", align: "left" }),
      lookup,
    );
    const [minX, , maxX] = bounds(placed?.contours ?? []);
    expect(minX).toBeCloseTo(2);
    // 2 字の行が幅いっぱい（124px）になり、1 字の行はその半分。
    expect(maxX).toBeCloseTo(EMOJI_HEIGHT - 2);
  });

  it("横長の幅は 2:1 から 3:1 の間", () => {
    expect(widthOf({ lines: ["ああ"], shape: "wide" })).toBe(256);
    expect(widthOf({ lines: ["あああ"], shape: "wide" })).toBe(384);
    expect(widthOf({ lines: ["ああああああ"], shape: "wide" })).toBe(384);
    expect(widthOf({ lines: ["ああ"], shape: "square" })).toBe(128);
  });
});

it("renderEmoji は、文字・縁取り・透明の順に塗る", () => {
  const rendered = renderEmoji(
    spec({ color: "#ff0000", outline: "#0000ff", outlineWidth: 6 }),
    lookup,
  );
  expect(rendered).toBeDefined();
  const { width, pixels } = rendered!;
  const rgba = (x: number, y: number) => [
    ...pixels.subarray((y * width + x) * 4, (y * width + x) * 4 + 4),
  ];
  expect(rgba(64, 64)).toEqual([255, 0, 0, 255]);
  expect(rgba(4, 64)).toEqual([0, 0, 255, 255]);
  expect(rgba(0, 0)[3]).toBe(0);
});
