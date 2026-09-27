import { isAnimatedImage } from "@streets/core/media/animation";
import { displaySize } from "@streets/core/media/display-size";

export type DownscaleRequest = { id: number; url: string; maxEdge: number };

/**
 * `blob` は縮めた画像。`null` は元の URL をそのまま使う（縮めなくてよい・動く画像・
 * CORS を許していない・読めない）。
 */
export type DownscaleReply = { id: number; blob: Blob | null };

const downscale = async (
  url: string,
  maxEdge: number,
): Promise<Blob | null> => {
  // Cookie は送らない。画像のホストに、誰が見ているかを渡さない。
  const response = await fetch(url, { mode: "cors", credentials: "omit" });
  if (!response.ok) return null;
  const blob = await response.blob();
  // 描き直すと 1 枚の絵になり、動きが失われる。
  if (isAnimatedImage(new Uint8Array(await blob.arrayBuffer()))) return null;

  // デコードの間だけ原寸の画素を持つ。表示する側（<img>）には縮めた分しか残らない。
  const bitmap = await createImageBitmap(blob);
  try {
    const size = displaySize(bitmap, maxEdge);
    if (!size) return null;
    const canvas = new OffscreenCanvas(size.width, size.height);
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.imageSmoothingQuality = "high";
    context.drawImage(bitmap, 0, 0, size.width, size.height);
    // 透明な部分を残せて、JPEG と同じくらい軽い。
    return await canvas.convertToBlob({ type: "image/webp", quality: 0.85 });
  } finally {
    bitmap.close();
  }
};

/** 表示する画像を画面の外で縮める。デコードと描き直しで画面を固めないように。 */
self.onmessage = async (event: MessageEvent<DownscaleRequest>) => {
  const { id, url, maxEdge } = event.data;
  let blob: Blob | null = null;
  try {
    blob = await downscale(url, maxEdge);
  } catch {
    // CORS を許していないホストでは fetch が失敗する。元の URL で <img> に任せる。
  }
  self.postMessage({ id, blob } satisfies DownscaleReply);
};
