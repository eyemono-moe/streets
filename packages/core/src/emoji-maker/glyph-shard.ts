/**
 * 文字の輪郭のファイルの形。ビルドのときにフォントから作り（tools/emoji-glyphs）、画面と
 * サーバーの両方が読む。`v1` の絵文字はこの形と中身を前提に描くので、変えるときは版を上げる。
 *
 * 1 つのファイルに、文字コードを 64 で割った商が同じ字を並べる。1 字の記録は次のとおりで、
 * 数はすべてリトルエンディアン。座標は 1 字を 1000 単位の枠に置き、y は下向き、基準線が 0。
 *
 * | 大きさ | 中身 |
 * | --- | --- |
 * | u32 | 文字コード |
 * | i16 | 送り幅 |
 * | i16 × 4 | インクの付く範囲（minX, minY, maxX, maxY） |
 * | u16 | 輪郭の数 |
 * | 輪郭ごとに u16 ＋ (i16 x, i16 y) × 点の数 | 閉じた折れ線 |
 *
 * 記録はどれも偶数バイトなので、点の並びは読み解かずに `Int16Array` の窓で指せる
 * （`Int16Array` は機械の並びで読むが、動かす先はどれもリトルエンディアン）。
 */

export type FontId = "gothic" | "rounded" | "serif";

/** その書体に無い字を、どの書体で補うか。丸ゴシックには第 2 水準の漢字が無い。 */
export const FALLBACK_FONT: Readonly<Record<FontId, FontId | undefined>> = {
  gothic: undefined,
  rounded: "gothic",
  serif: undefined,
};

export type Glyph = {
  advance: number;
  /** minX, minY, maxX, maxY */
  box: readonly [number, number, number, number];
  /** 閉じた折れ線。x, y, x, y, … */
  contours: readonly Int16Array[];
};

const SHARD_BITS = 6;

/** その字が入っているファイルの名前（拡張子なし）。 */
export const shardName = (codePoint: number): string =>
  (codePoint >> SHARD_BITS).toString(16);

export type GlyphShard = { get: (codePoint: number) => Glyph | undefined };

const HEADER = 16;

/** 1 字の記録を作る。前処理で使う。 */
export const encodeGlyph = (
  codePoint: number,
  glyph: {
    advance: number;
    box: readonly [number, number, number, number];
    contours: readonly (readonly number[])[];
  },
): Uint8Array => {
  const size =
    HEADER +
    glyph.contours.reduce((sum, points) => sum + 2 + points.length * 2, 0);
  const bytes = new Uint8Array(size);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, codePoint, true);
  view.setInt16(4, glyph.advance, true);
  glyph.box.forEach((value, i) => view.setInt16(6 + i * 2, value, true));
  view.setUint16(14, glyph.contours.length, true);
  let at = HEADER;
  for (const points of glyph.contours) {
    view.setUint16(at, points.length / 2, true);
    at += 2;
    for (const value of points) {
      view.setInt16(at, value, true);
      at += 2;
    }
  }
  return bytes;
};

/**
 * ファイルから、文字コードと記録の位置の表だけを作る。点の並びは、引かれたときに
 * ファイルの中を指す。
 */
export const decodeShard = (buffer: ArrayBuffer): GlyphShard => {
  const view = new DataView(buffer);
  const offsets = new Map<number, number>();
  let at = 0;
  while (at + HEADER <= view.byteLength) {
    offsets.set(view.getUint32(at, true), at);
    const count = view.getUint16(at + 14, true);
    at += HEADER;
    for (let c = 0; c < count; c++) at += 2 + view.getUint16(at, true) * 4;
  }
  const decoded = new Map<number, Glyph>();
  return {
    get: (codePoint) => {
      const start = offsets.get(codePoint);
      if (start === undefined) return undefined;
      const cached = decoded.get(codePoint);
      if (cached) return cached;
      const count = view.getUint16(start + 14, true);
      const contours: Int16Array[] = [];
      let p = start + HEADER;
      for (let c = 0; c < count; c++) {
        const points = view.getUint16(p, true);
        contours.push(new Int16Array(buffer, p + 2, points * 2));
        p += 2 + points * 4;
      }
      const glyph: Glyph = {
        advance: view.getInt16(start + 4, true),
        box: [
          view.getInt16(start + 6, true),
          view.getInt16(start + 8, true),
          view.getInt16(start + 10, true),
          view.getInt16(start + 12, true),
        ],
        contours,
      };
      decoded.set(codePoint, glyph);
      return glyph;
    },
  };
};
