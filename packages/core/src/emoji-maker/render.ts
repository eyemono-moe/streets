import {
  FALLBACK_FONT,
  type FontId,
  type Glyph,
  shardName,
} from "./glyph-shard";
import type { EmojiSpec } from "./spec";
import type { HexColor } from "./style";
import { graphemes } from "./text";

/** 絵文字の高さ。リアクションは小さく出るので、これより大きくしない。 */
export const EMOJI_HEIGHT = 128;
const MIN_WIDE = EMOJI_HEIGHT * 2;
const MAX_WIDE = EMOJI_HEIGHT * 3;

/** 書体と文字コードから字を引く。まだ読んでいないファイルの字も `undefined` になる。 */
export type GlyphLookup = (
  font: FontId,
  codePoint: number,
) => Glyph | undefined;

/** 描く前に読んでおくファイル。書体ごとの名前の一覧。 */
export const shardsFor = (spec: Pick<EmojiSpec, "lines" | "font">) => {
  const fonts = [spec.font, FALLBACK_FONT[spec.font]].filter(
    (font): font is FontId => font !== undefined,
  );
  const names = new Set(
    spec.lines.flatMap((line) =>
      graphemes(line).map((ch) => shardName(ch.codePointAt(0) ?? 0)),
    ),
  );
  return fonts.flatMap((font) => [...names].map((name) => ({ font, name })));
};

const glyphFor = (lookup: GlyphLookup, font: FontId, ch: string) => {
  const codePoint = ch.codePointAt(0) ?? 0;
  // 2 つ以上の文字コードでできた字（絵文字の組み合わせなど）は、輪郭を持たない。
  if (ch.length > String.fromCodePoint(codePoint).length) return undefined;
  const fallback = FALLBACK_FONT[font];
  return (
    lookup(font, codePoint) ??
    (fallback === undefined ? undefined : lookup(fallback, codePoint))
  );
};

/** 描けない字。重ねずに 1 つずつ返す。 */
export const missingChars = (
  spec: Pick<EmojiSpec, "lines" | "font">,
  lookup: GlyphLookup,
): string[] => [
  ...new Set(
    spec.lines.flatMap((line) =>
      graphemes(line).filter(
        (ch) => glyphFor(lookup, spec.font, ch) === undefined,
      ),
    ),
  ),
];

export const widthOf = (spec: Pick<EmojiSpec, "lines" | "shape">): number => {
  if (spec.shape === "square") return EMOJI_HEIGHT;
  const longest = Math.max(
    1,
    ...spec.lines.map((line) => graphemes(line).length),
  );
  const perChar = EMOJI_HEIGHT / Math.max(1, spec.lines.length);
  return Math.min(MAX_WIDE, Math.max(MIN_WIDE, Math.round(longest * perChar)));
};

export type Placed = {
  width: number;
  height: number;
  contours: Float32Array[];
};

/**
 * 字を並べ、画素の座標に写した折れ線にする。行ごとにインクの付く範囲を枠に合わせる
 * （伸ばすときは行ごとに縦横を別々に、保つときは全部の行を同じ倍率で）。
 * 描けない字があれば `undefined`（先に `missingChars` で確かめる）。
 */
export const place = (
  spec: EmojiSpec,
  lookup: GlyphLookup,
): Placed | undefined => {
  const width = widthOf(spec);
  const height = EMOJI_HEIGHT;
  const pad = (spec.outline ? spec.outlineWidth : 0) + 2;
  const count = Math.max(1, spec.lines.length);
  const cellW = width - pad * 2;
  const cellH = (height - pad * 2) / count;

  const rows: {
    glyphs: { x: number; glyph: Glyph }[];
    minX: number;
    minY: number;
    w: number;
    h: number;
  }[] = [];
  for (const line of spec.lines) {
    let x = 0;
    const glyphs: { x: number; glyph: Glyph }[] = [];
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const ch of graphemes(line)) {
      const glyph = glyphFor(lookup, spec.font, ch);
      if (!glyph) return undefined;
      if (glyph.contours.length > 0) {
        glyphs.push({ x, glyph });
        minX = Math.min(minX, x + glyph.box[0]);
        maxX = Math.max(maxX, x + glyph.box[2]);
        minY = Math.min(minY, glyph.box[1]);
        maxY = Math.max(maxY, glyph.box[3]);
      }
      x += glyph.advance;
    }
    if (glyphs.length > 0) {
      rows.push({ glyphs, minX, minY, w: maxX - minX, h: maxY - minY });
    }
  }

  const common = Math.min(
    ...rows.map((row) => Math.min(cellW / row.w, cellH / row.h)),
  );
  const contours: Float32Array[] = [];
  rows.forEach((row, i) => {
    const stretch = spec.fit === "stretch";
    const sx = stretch ? cellW / row.w : common;
    const sy = stretch ? cellH / row.h : common;
    const drawnW = row.w * sx;
    const drawnH = row.h * sy;
    const ox =
      stretch || spec.align === "center"
        ? pad + (cellW - drawnW) / 2
        : spec.align === "left"
          ? pad
          : pad + cellW - drawnW;
    // 保つときは、行の塊を縦の真ん中に置く。
    const blockH = stretch ? cellH * count : drawnH * rows.length;
    const oy =
      pad + (height - pad * 2 - blockH) / 2 + i * (stretch ? cellH : drawnH);
    for (const { x, glyph } of row.glyphs) {
      for (const points of glyph.contours) {
        const out = new Float32Array(points.length);
        for (let k = 0; k < points.length; k += 2) {
          out[k] = ox + (x + (points[k] ?? 0) - row.minX) * sx;
          out[k + 1] = oy + ((points[k + 1] ?? 0) - row.minY) * sy;
        }
        contours.push(out);
      }
    }
  });
  return { width, height, contours };
};

/**
 * 面積を足していく塗り方（font-rs と同じ）。線分ごとに、かかる画素へ符号付きの面積を足し、
 * 最後に左から足し合わせると、各画素の覆われた割合になる。輪郭が閉じていれば行の和は 0 に
 * 戻るので、行の終わりからはみ出した分は次の行の頭で打ち消される。
 */
export const rasterize = (
  contours: readonly Float32Array[],
  width: number,
  height: number,
): Float32Array => {
  const acc = new Float32Array(width * height + 4);
  const line = (ax: number, ay: number, bx: number, by: number) => {
    if (ay === by) return;
    let dir = 1;
    let x0 = ax;
    let y0 = ay;
    let x1 = bx;
    let y1 = by;
    if (y0 > y1) {
      dir = -1;
      [x0, y0, x1, y1] = [bx, by, ax, ay];
    }
    const dxdy = (x1 - x0) / (y1 - y0);
    let x = x0;
    let yStart = Math.floor(y0);
    if (y0 < 0) {
      x -= y0 * dxdy;
      yStart = 0;
    }
    const yEnd = Math.min(height, Math.ceil(y1));
    for (let y = yStart; y < yEnd; y++) {
      const row = y * width;
      const dy = Math.min(y + 1, y1) - Math.max(y, y0);
      const xNext = x + dxdy * dy;
      const d = dy * dir;
      const lo = Math.min(x, xNext);
      const hi = Math.max(x, xNext);
      const loFloor = Math.floor(lo);
      const loI = loFloor | 0;
      const hiCeil = Math.ceil(hi);
      const hiI = hiCeil | 0;
      if (hiI <= loI + 1) {
        const mid = 0.5 * (x + xNext) - loFloor;
        acc[row + loI] = (acc[row + loI] ?? 0) + d - d * mid;
        acc[row + loI + 1] = (acc[row + loI + 1] ?? 0) + d * mid;
      } else {
        const s = 1 / (hi - lo);
        const loFrac = lo - loFloor;
        const a0 = 0.5 * s * (1 - loFrac) * (1 - loFrac);
        const hiFrac = hi - hiCeil + 1;
        const am = 0.5 * s * hiFrac * hiFrac;
        acc[row + loI] = (acc[row + loI] ?? 0) + d * a0;
        if (hiI === loI + 2) {
          acc[row + loI + 1] = (acc[row + loI + 1] ?? 0) + d * (1 - a0 - am);
        } else {
          const a1 = s * (1.5 - loFrac);
          acc[row + loI + 1] = (acc[row + loI + 1] ?? 0) + d * (a1 - a0);
          for (let xi = loI + 2; xi < hiI - 1; xi++) {
            acc[row + xi] = (acc[row + xi] ?? 0) + d * s;
          }
          const a2 = a1 + (hiI - loI - 3) * s;
          acc[row + hiI - 1] = (acc[row + hiI - 1] ?? 0) + d * (1 - a2 - am);
        }
        acc[row + hiI] = (acc[row + hiI] ?? 0) + d * am;
      }
      x = xNext;
    }
  };
  for (const points of contours) {
    const n = points.length;
    for (let k = 0; k < n; k += 2) {
      const j = (k + 2) % n;
      line(
        points[k] ?? 0,
        points[k + 1] ?? 0,
        points[j] ?? 0,
        points[j + 1] ?? 0,
      );
    }
  }
  const coverage = new Float32Array(width * height);
  let sum = 0;
  for (let i = 0; i < width * height; i++) {
    sum += acc[i] ?? 0;
    // 重なった輪郭は 1 で打ち止め（nonzero）。
    coverage[i] = Math.min(1, Math.abs(sum));
  }
  return coverage;
};

/** 1 次元の距離変換（Felzenszwalb）。f は各点の「中までの距離の 2 乗」。 */
const distance1d = (
  f: Float32Array,
  n: number,
  out: Float32Array,
  v: Int32Array,
  z: Float32Array,
) => {
  let k = 0;
  v[0] = 0;
  z[0] = -Infinity;
  z[1] = Infinity;
  for (let q = 1; q < n; q++) {
    const fq = f[q] ?? 0;
    let s = 0;
    for (;;) {
      const p = v[k] ?? 0;
      s = (fq + q * q - ((f[p] ?? 0) + p * p)) / (2 * q - 2 * p);
      if (s > (z[k] ?? 0)) break;
      k--;
    }
    k++;
    v[k] = q;
    z[k] = s;
    z[k + 1] = Infinity;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while ((z[k + 1] ?? 0) < q) k++;
    const p = v[k] ?? 0;
    out[q] = (q - p) * (q - p) + (f[p] ?? 0);
  }
};

/**
 * 縁取りの濃さ。文字の中（半分以上覆われた画素）までの距離を出し、半径以内を塗る。
 * 線を引いて縁取るのに比べてずっと軽く、字を縦横で違う倍率に伸ばしても太さが変わらない。
 */
export const outlineMask = (
  coverage: Float32Array,
  width: number,
  height: number,
  radius: number,
): Float32Array => {
  const far = 1e9;
  const sq = new Float32Array(width * height);
  for (let i = 0; i < sq.length; i++)
    sq[i] = (coverage[i] ?? 0) >= 0.5 ? 0 : far;
  const n = Math.max(width, height);
  const f = new Float32Array(n);
  const out = new Float32Array(n);
  const v = new Int32Array(n);
  const z = new Float32Array(n + 1);
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) f[y] = sq[y * width + x] ?? far;
    distance1d(f, height, out, v, z);
    for (let y = 0; y < height; y++) sq[y * width + x] = out[y] ?? far;
  }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) f[x] = sq[y * width + x] ?? far;
    distance1d(f, width, out, v, z);
    for (let x = 0; x < width; x++) sq[y * width + x] = out[x] ?? far;
  }
  const mask = new Float32Array(width * height);
  for (let i = 0; i < mask.length; i++) {
    const edge = Math.min(
      1,
      Math.max(0, radius + 0.5 - Math.sqrt(sq[i] ?? far)),
    );
    mask[i] = Math.max(coverage[i] ?? 0, edge);
  }
  return mask;
};

const rgb = (hex: HexColor) =>
  [
    Number.parseInt(hex.slice(1, 3), 16),
    Number.parseInt(hex.slice(3, 5), 16),
    Number.parseInt(hex.slice(5, 7), 16),
  ] as const;

/** 文字を縁取りの上に重ねた RGBA。乗算していないアルファ（PNG と ImageData の形）。 */
export const composite = (
  coverage: Float32Array,
  outline: Float32Array | undefined,
  width: number,
  height: number,
  color: HexColor,
  outlineColor: HexColor | null,
): Uint8ClampedArray => {
  const [fr, fg, fb] = rgb(color);
  const [or, og, ob] = outlineColor ? rgb(outlineColor) : ([0, 0, 0] as const);
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const af = coverage[i] ?? 0;
    const ao = outline ? (outline[i] ?? 0) * (1 - af) : 0;
    const a = af + ao;
    if (a <= 0) continue;
    const j = i * 4;
    pixels[j] = (fr * af + or * ao) / a;
    pixels[j + 1] = (fg * af + og * ao) / a;
    pixels[j + 2] = (fb * af + ob * ao) / a;
    pixels[j + 3] = a * 255;
  }
  return pixels;
};

export type Rendered = {
  width: number;
  height: number;
  pixels: Uint8ClampedArray;
};

/** 描く。描けない字があれば `undefined`。画面の見本もサーバーも、これを通す。 */
export const renderEmoji = (
  spec: EmojiSpec,
  lookup: GlyphLookup,
): Rendered | undefined => {
  const placed = place(spec, lookup);
  if (!placed) return undefined;
  const { width, height, contours } = placed;
  const coverage = rasterize(contours, width, height);
  const outline = spec.outline
    ? outlineMask(coverage, width, height, spec.outlineWidth)
    : undefined;
  return {
    width,
    height,
    pixels: composite(
      coverage,
      outline,
      width,
      height,
      spec.color,
      spec.outline,
    ),
  };
};
