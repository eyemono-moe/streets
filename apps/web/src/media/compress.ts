import {
  MAX_BYTES,
  MAX_EDGE,
  type OutputType,
  compressionAttempts,
  outputTypeFor,
} from "@streets/core/media/compress-plan";
import type { CropRect } from "@streets/core/view/compose";

export type CompressRequest = {
  file: Blob;
  /** 元の種類（`image/png` など）。 */
  type: string;
  crop?: CropRect;
  /**
   * 大きさにかかわらず描き直す（切り抜く・撮影情報を落とす・重すぎる）。無ければ、
   * 長辺が上限を超えるときだけ描き直す。
   */
  force: boolean;
};

/** 描き直さなくてよいときは `undefined`（元のまま預ける）。 */
export type CompressResult = { blob: Blob; type: OutputType } | undefined;

type Canvas = OffscreenCanvas;
type Source = { x: number; y: number; width: number; height: number };

/** 元の画像からはみ出す範囲は切り落とす（画面の丸め誤差で 1 画素はみ出ることがある）。 */
const clampCrop = (crop: CropRect | undefined, full: Source): Source => {
  const source = crop ?? full;
  const x = Math.max(0, Math.min(Math.round(source.x), full.width - 1));
  const y = Math.max(0, Math.min(Math.round(source.y), full.height - 1));
  return {
    x,
    y,
    width: Math.max(1, Math.min(Math.round(source.width), full.width - x)),
    height: Math.max(1, Math.min(Math.round(source.height), full.height - y)),
  };
};

const draw = (
  bitmap: ImageBitmap,
  source: Source,
  size: { width: number; height: number },
): Canvas => {
  const canvas = new OffscreenCanvas(size.width, size.height);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("画像を作り直せませんでした");
  context.drawImage(
    bitmap,
    source.x,
    source.y,
    source.width,
    source.height,
    0,
    0,
    size.width,
    size.height,
  );
  return canvas;
};

/** 透明な画素があるか。小さく描いた写しで見る（全画素を見ると重い）。 */
const hasAlpha = (bitmap: ImageBitmap, source: Source): boolean => {
  const scale = Math.min(1, 256 / Math.max(source.width, source.height));
  const size = {
    width: Math.max(1, Math.round(source.width * scale)),
    height: Math.max(1, Math.round(source.height * scale)),
  };
  const context = draw(bitmap, source, size).getContext("2d");
  const pixels = context?.getImageData(0, 0, size.width, size.height).data;
  if (!pixels) return false;
  for (let index = 3; index < pixels.length; index += 4) {
    if ((pixels[index] ?? 255) < 255) return true;
  }
  return false;
};

/**
 * 書き出す。頼んだ形式で書き出せない環境（WebP を書き出せないブラウザなど）では、
 * 透明を残せる PNG で書き出す。
 */
const encode = async (
  canvas: Canvas,
  type: OutputType,
  quality: number,
): Promise<{ blob: Blob; type: OutputType }> => {
  const blob = await canvas.convertToBlob({ type, quality });
  return blob.type === type
    ? { blob, type }
    : {
        blob: await canvas.convertToBlob({ type: "image/png" }),
        type: "image/png",
      };
};

/**
 * 切り抜き・縮小・撮影情報（EXIF）の除去をして、長辺 1920px・5MB 以内に収める。
 * 描き直した絵には撮影情報が付かないので EXIF はここで落ちる。向きは
 * `createImageBitmap` が EXIF どおりに直してから読むので、回ったままにはならない。
 * 収めきれないときは、試した中で最後のものを返す（預け先に断られるに任せる）。
 */
export const compressImage = async (
  request: CompressRequest,
): Promise<CompressResult> => {
  const bitmap = await createImageBitmap(request.file, {
    imageOrientation: "from-image",
  });
  try {
    const full = { x: 0, y: 0, width: bitmap.width, height: bitmap.height };
    if (!request.force && Math.max(full.width, full.height) <= MAX_EDGE) {
      return undefined;
    }
    const source = clampCrop(request.crop, full);

    // 上限に収まるまで、`type` で試す。PNG は画質で縮まないので、最初の 1 回で見切る。
    const tryType = async (type: OutputType) => {
      let last: { blob: Blob; type: OutputType } | undefined;
      for (const attempt of compressionAttempts(source, type)) {
        last = await encode(
          draw(bitmap, source, attempt),
          type,
          attempt.quality,
        );
        if (last.blob.size <= MAX_BYTES) return { fits: true, last };
        if (type === "image/png") break;
      }
      return { fits: false, last };
    };

    const first = outputTypeFor({
      inputType: request.type,
      overLimit: false,
      hasAlpha: false,
    });
    const tried = await tryType(first);
    if (tried.fits || first !== "image/png") return tried.last;
    // PNG のままでは収まらない。透明が無ければ JPEG、あれば WebP にして試し直す。
    const second = outputTypeFor({
      inputType: request.type,
      overLimit: true,
      hasAlpha: hasAlpha(bitmap, source),
    });
    return (await tryType(second)).last;
  } finally {
    bitmap.close();
  }
};
