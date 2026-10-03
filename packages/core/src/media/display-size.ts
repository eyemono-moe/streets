/**
 * 表示するときに、画像をどこまで縮めて読み込むか。ブラウザはデコードした画像を
 * 元の画素数のまま持つので、4284×5712 の写真を 240×320 で見せるだけでも 93MB 取る。
 */

type Size = { width: number; height: number };

/** 投稿の添付画像の長辺。枠は高さ 320px までなので、画素の細かい画面（3 倍）でも粗くならない。 */
export const MEDIA_MAX_EDGE = 960;

/**
 * メディアの格子の 1 マスの長辺。マスは正方形に切り抜くので、短辺がマスの幅（3 列で
 * 140px ほど、3 倍の画面で 420px）を下回らないよう、縦横比 3:4 の写真でも足りる長さにする。
 */
export const MEDIA_TILE_MAX_EDGE = 640;

/** プロフィールのバナーの長辺。カラムの幅いっぱいに横長で敷く。 */
export const BANNER_MAX_EDGE = 1200;

/** 長辺が上限をこの割合より超えていなければ縮めない。少しだけ縮めても、減る量より手間のほうが大きい。 */
const MARGIN = 1.25;

/** 縮めた後の大きさ。縮めなくてよいときは `undefined`。 */
export const displaySize = (
  natural: Size,
  maxEdge: number,
): Size | undefined => {
  const edge = Math.max(natural.width, natural.height);
  if (edge <= maxEdge * MARGIN) return undefined;
  const scale = maxEdge / edge;
  return {
    width: Math.max(1, Math.round(natural.width * scale)),
    height: Math.max(1, Math.round(natural.height * scale)),
  };
};
