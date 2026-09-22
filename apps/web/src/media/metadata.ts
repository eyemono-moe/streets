import type { BlobDescriptor } from "@streets/core/media/blossom";
import { encode } from "blurhash";

type UploadMetadata = Pick<BlobDescriptor, "dimensions" | "blurhash">;

/** 元画像全体を小さく描いてから符号化する。大きい画素配列を Blurhash に渡さない。 */
const encodePreview = (
  source: CanvasImageSource,
  dimensions: { width: number; height: number },
): string | undefined => {
  try {
    const scale = 32 / Math.max(dimensions.width, dimensions.height);
    const width = Math.max(4, Math.round(dimensions.width * scale));
    const height = Math.max(4, Math.round(dimensions.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return undefined;
    context.drawImage(source, 0, 0, width, height);
    return encode(
      context.getImageData(0, 0, width, height).data,
      width,
      height,
      4,
      3,
    );
  } catch {
    // 画素を読めない形式でもアップロードは続ける。
    return undefined;
  }
};

const imageMetadata = async (file: File): Promise<UploadMetadata> => {
  const url = URL.createObjectURL(file);
  const image = new Image();
  try {
    image.src = url;
    await image.decode();
    const dimensions = {
      width: image.naturalWidth,
      height: image.naturalHeight,
    };
    return {
      dimensions,
      blurhash: encodePreview(image, dimensions),
    };
  } finally {
    URL.revokeObjectURL(url);
  }
};

/** ブラウザが動画を読めない場合も、取得できた寸法だけを返す。 */
const videoMetadata = async (file: File): Promise<UploadMetadata> => {
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.muted = true;
  video.preload = "auto";
  video.playsInline = true;
  try {
    const ready = await new Promise<boolean>((resolve) => {
      const finish = (ok: boolean) => {
        clearTimeout(timer);
        video.removeEventListener("loadedmetadata", onReady);
        video.removeEventListener("error", onError);
        resolve(ok);
      };
      const onReady = () => finish(true);
      const onError = () => finish(false);
      const timer = setTimeout(() => finish(false), 2500);
      video.addEventListener("loadedmetadata", onReady);
      video.addEventListener("error", onError);
      video.src = url;
      video.load();
    });
    if (!ready || video.videoWidth <= 0 || video.videoHeight <= 0) return {};
    const dimensions = { width: video.videoWidth, height: video.videoHeight };
    const frameReady = await new Promise<boolean>((resolve) => {
      if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
        resolve(true);
        return;
      }
      const finish = (ok: boolean) => {
        clearTimeout(timer);
        video.removeEventListener("loadeddata", onReady);
        video.removeEventListener("error", onError);
        resolve(ok);
      };
      const onReady = () => finish(true);
      const onError = () => finish(false);
      const timer = setTimeout(() => finish(false), 1500);
      video.addEventListener("loadeddata", onReady);
      video.addEventListener("error", onError);
      try {
        video.currentTime = Math.min(0.1, video.duration || 0);
      } catch {
        finish(false);
      }
    });
    return {
      dimensions,
      ...(frameReady ? { blurhash: encodePreview(video, dimensions) } : {}),
    };
  } finally {
    video.pause();
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(url);
  }
};

/** `imeta` に書く情報。読めないファイルでも投稿を止めない。 */
export const uploadMetadata = async (file: File): Promise<UploadMetadata> => {
  try {
    if (file.type.startsWith("image/")) return await imageMetadata(file);
    if (file.type.startsWith("video/")) return await videoMetadata(file);
  } catch {
    // メタデータは任意。アップロードの成否に影響させない。
  }
  return {};
};
