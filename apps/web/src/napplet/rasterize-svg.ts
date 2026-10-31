import {
  NAPPLET_SVG_MAX_BYTES,
  type RasterizeSvg,
} from "@streets/core/napplet/resource";

// > Recommended caps: 5 MiB input, 4096 x 4096 output, 2 s raster time.
const MAX_SIDE = 4096;
const TIMEOUT_MS = 2000;
// 大きさを持たない SVG を <img> に入れたときの既定の大きさ（CSS の置換要素と同じ）。
const FALLBACK_WIDTH = 300;
const FALLBACK_HEIGHT = 150;

/**
 * SVG を PNG に描き直す。NAP-RESOURCE は Worker で描くよう挙げるが、Worker の
 * `createImageBitmap` は SVG を読めない。`<img>` で読んだ SVG はスクリプトを動かさず
 * 外のものも読まない（secure static mode）ので、ネットワークの無い場で描くのと同じになる。
 */
export const rasterizeSvg: RasterizeSvg = async (bytes, signal) => {
  if (bytes.byteLength > NAPPLET_SVG_MAX_BYTES) return undefined;
  const url = URL.createObjectURL(
    new Blob([bytes as BlobPart], { type: "image/svg+xml" }),
  );
  try {
    const image = new Image();
    image.src = url;
    const decoded = await Promise.race([
      image.decode().then(() => true),
      new Promise<false>((resolve) => setTimeout(resolve, TIMEOUT_MS, false)),
    ]);
    if (!decoded || signal?.aborted) return undefined;
    const naturalWidth = image.naturalWidth || FALLBACK_WIDTH;
    const naturalHeight = image.naturalHeight || FALLBACK_HEIGHT;
    const scale = Math.min(1, MAX_SIDE / Math.max(naturalWidth, naturalHeight));
    const width = Math.max(1, Math.round(naturalWidth * scale));
    const height = Math.max(1, Math.round(naturalHeight * scale));
    const canvas = new OffscreenCanvas(width, height);
    canvas.getContext("2d")?.drawImage(image, 0, 0, width, height);
    return await canvas.convertToBlob({ type: "image/png" });
  } catch {
    // 壊れた SVG や、描いたものを読み出せない canvas（汚染）は、描けなかったとして扱う。
    return undefined;
  } finally {
    URL.revokeObjectURL(url);
  }
};
