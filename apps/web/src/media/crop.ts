import type { CropRect } from "@streets/core/view/compose";

/** 切り抜いた画像の種類。png で出すと写真が大きく膨らむので、元が jpeg / webp ならそのまま。 */
const outputType = (type: string | undefined) =>
  type === "image/jpeg" || type === "image/webp" ? type : "image/png";

/** jpeg / webp のときの画質。png では使われない。 */
const QUALITY = 0.92;

const toBlob = (canvas: HTMLCanvasElement, type: string): Promise<Blob> =>
  new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error("画像を切り抜けませんでした")),
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
 * 決めた範囲で実際に切り抜く。書きかけの間は範囲だけを持ち、預ける直前に
 * ここで 1 回だけ画素を作る —— 元の画像を残しておけば、何度でも切り直せる。
 */
export const renderCrop = async (file: File, crop: CropRect): Promise<File> => {
  const image = await loadImage(file);
  // 元の画像からはみ出す範囲は切り落とす（画面の丸め誤差で 1 画素はみ出ることがある）。
  const x = Math.max(0, Math.min(Math.round(crop.x), image.naturalWidth - 1));
  const y = Math.max(0, Math.min(Math.round(crop.y), image.naturalHeight - 1));
  const width = Math.max(
    1,
    Math.min(Math.round(crop.width), image.naturalWidth - x),
  );
  const height = Math.max(
    1,
    Math.min(Math.round(crop.height), image.naturalHeight - y),
  );

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("画像を切り抜けませんでした");
  context.drawImage(image, x, y, width, height, 0, 0, width, height);

  const type = outputType(file.type);
  const blob = await toBlob(canvas, type);
  return new File([blob], file.name, { type });
};
