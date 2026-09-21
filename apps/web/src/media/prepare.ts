import { isAnimatedImage } from "@streets/core/media/animation";
import { hasExif } from "@streets/core/media/exif";
import type { CropRect } from "@streets/core/view/compose";

/**
 * アップロードする前に縮める上限（長辺）。v0 と同じ 1920px。大きいまま送ると、
 * アップロード先の上限に当たったり、読む側の通信量が増えたりする。
 */
const MAX_EDGE = 1920;

/** 出す種類。png で出すと写真が大きく膨らむので、元が jpeg / webp ならそのまま。 */
const outputType = (type: string | undefined) =>
  type === "image/jpeg" || type === "image/webp" ? type : "image/png";

/** jpeg / webp のときの画質。png では使われない。 */
const QUALITY = 0.92;

const toBlob = (canvas: HTMLCanvasElement, type: string): Promise<Blob> =>
  new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error("画像を作り直せませんでした")),
      type,
      QUALITY,
    );
  });

/** 画像を読む。`createImageBitmap` は使わない —— 環境によっては File を読めない。 */
const loadImage = async (file: File): Promise<HTMLImageElement> => {
  const image = new Image();
  const url = URL.createObjectURL(file);
  try {
    image.src = url;
    await image.decode();
    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
};

/**
 * 決めた範囲で切り抜き、大きければ縮めて描き直す。描き直した絵には撮ったときの
 * 情報が付かないので、EXIF（撮影場所など）もここで落ちる。向きは `<img>` が
 * EXIF どおりに直したものを写すので、回ったままにはならない。
 */
const render = async (
  file: File,
  crop: CropRect | undefined,
): Promise<File> => {
  const image = await loadImage(file);
  const full = { width: image.naturalWidth, height: image.naturalHeight };
  const source = crop ?? { x: 0, y: 0, ...full };
  // 元の画像からはみ出す範囲は切り落とす（画面の丸め誤差で 1 画素はみ出ることがある）。
  const x = Math.max(0, Math.min(Math.round(source.x), full.width - 1));
  const y = Math.max(0, Math.min(Math.round(source.y), full.height - 1));
  const width = Math.max(1, Math.min(Math.round(source.width), full.width - x));
  const height = Math.max(
    1,
    Math.min(Math.round(source.height), full.height - y),
  );

  // 縮めるだけ。小さい画像を引き伸ばさない。
  const scale = Math.min(1, MAX_EDGE / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("画像を作り直せませんでした");
  context.drawImage(
    image,
    x,
    y,
    width,
    height,
    0,
    0,
    canvas.width,
    canvas.height,
  );

  const type = outputType(file.type);
  const blob = await toBlob(canvas, type);
  return new File([blob], file.name, { type });
};

/**
 * アップロードする中身を作る。書きかけの間は切り抜く範囲を持つだけにして、ここで 1 回だけ
 * 画素を作る —— 元の画像を残しておけば、何度でも切り直せる。
 *
 * そのままアップロードするのは、動画と、動く画像（描き直すと 1 枚の絵になる）と、
 * 切り抜きも縮小も EXIF の除去も要らないもの。
 */
export const prepareForUpload = async (
  file: File,
  crop: CropRect | undefined,
): Promise<File> => {
  if (file.type.startsWith("video/")) return file;

  const bytes = new Uint8Array(await file.arrayBuffer());
  // 動く画像は、切ると決めたときだけ描き直す（動きは失われる。切り抜く画面で伝えている）。
  if (isAnimatedImage(bytes)) return crop ? render(file, crop) : file;
  if (crop || hasExif(bytes)) return render(file, crop);

  const image = await loadImage(file);
  const tooBig = Math.max(image.naturalWidth, image.naturalHeight) > MAX_EDGE;
  return tooBig ? render(file, undefined) : file;
};
