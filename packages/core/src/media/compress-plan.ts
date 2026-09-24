/**
 * 預ける前に画像をどこまで縮めるか。v0 と同じ上限で、長辺 1920px と 5MB。
 * 1920px の写真はふつう 1MB 前後に収まり、5MB に当たるのは主に重い PNG。
 */
export const MAX_EDGE = 1920;
export const MAX_BYTES = 5 * 1024 * 1024;

/** 写真を書き出すときの最初の画質。上限を超えたら `QUALITY_STEPS` の順に下げる。 */
export const FIRST_QUALITY = 0.92;
const QUALITY_STEPS = [FIRST_QUALITY, 0.85, 0.75, 0.65, 0.55] as const;

/** 画質を下げきっても超えるときは、長辺をこの割合ずつ縮める。 */
const SHRINK = 0.8;
/** これより小さくはしない。ここまで縮めても超えるなら、そのまま預けて断られるに任せる。 */
const MIN_EDGE = 640;

export type OutputType = "image/jpeg" | "image/webp" | "image/png";

/**
 * 書き出す形式。元の形式をできるだけ守る。
 *
 * - JPEG・WebP はそのまま
 * - PNG（とそれ以外）は、上限に収まるなら PNG のまま（スクリーンショットの文字をくっきり残す）
 * - 収まらないときは、透明な部分が無ければ JPEG、あれば透明を残せる WebP
 */
export const outputTypeFor = (options: {
  inputType: string;
  overLimit: boolean;
  hasAlpha: boolean;
}): OutputType => {
  if (
    options.inputType === "image/jpeg" ||
    options.inputType === "image/webp"
  ) {
    return options.inputType;
  }
  if (!options.overLimit) return "image/png";
  return options.hasAlpha ? "image/webp" : "image/jpeg";
};

export type Size = { width: number; height: number };

/** 長辺を `maxEdge` 以下にする。小さい画像は引き伸ばさない。 */
export const fitWithin = (size: Size, maxEdge: number): Size => {
  const scale = Math.min(1, maxEdge / Math.max(size.width, size.height));
  return {
    width: Math.max(1, Math.round(size.width * scale)),
    height: Math.max(1, Math.round(size.height * scale)),
  };
};

export type Attempt = Size & {
  /** jpeg / webp の画質。png では使われない。 */
  quality: number;
};

/**
 * 上限に収まるまで試す順番。まず長辺 `MAX_EDGE` で画質を段階的に下げ、それでも
 * 超えるなら長辺を縮めて画質を戻し、また下げる。PNG は画質で縮まないので、
 * 大きさだけを縮める。最初の 1 つは「上限に収まっていれば、これで出す」もの。
 */
export function* compressionAttempts(
  source: Size,
  type: OutputType,
): Generator<Attempt> {
  const qualities = type === "image/png" ? [FIRST_QUALITY] : QUALITY_STEPS;
  let size = fitWithin(source, MAX_EDGE);
  for (;;) {
    for (const quality of qualities) yield { ...size, quality };
    const edge = Math.max(size.width, size.height);
    if (edge <= MIN_EDGE) return;
    size = fitWithin(size, Math.max(MIN_EDGE, Math.floor(edge * SHRINK)));
  }
}
