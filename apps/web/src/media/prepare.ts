import { isAnimatedImage } from "@streets/core/media/animation";
import { MAX_BYTES } from "@streets/core/media/compress-plan";
import { hasExif } from "@streets/core/media/exif";
import type { CropRect } from "@streets/core/view/compose";
import {
  type CompressRequest,
  type CompressResult,
  compressImage,
} from "./compress";

type WorkerReply =
  | { ok: true; result: CompressResult }
  | { ok: false; message: string };

/** Web Worker で描き直す。Worker を作れない環境では、この画面で描き直す。 */
const compress = (request: CompressRequest): Promise<CompressResult> => {
  let worker: Worker;
  try {
    worker = new Worker(new URL("./compress.worker.ts", import.meta.url), {
      type: "module",
    });
  } catch {
    return compressImage(request);
  }
  return new Promise<CompressResult>((resolve, reject) => {
    worker.onmessage = (event: MessageEvent<WorkerReply>) => {
      worker.terminate();
      if (event.data.ok) resolve(event.data.result);
      else reject(new Error(event.data.message));
    };
    worker.onerror = (event) => {
      worker.terminate();
      reject(new Error(event.message || "画像を作り直せませんでした"));
    };
    worker.postMessage(request);
  }).catch(() => compressImage(request));
};

const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/png": "png",
};

/** 形式が変わったら拡張子も合わせる（預け先や読む側が名前で種類を推すことがある）。 */
const renamed = (name: string, type: string) => {
  const extension = EXTENSIONS[type];
  if (!extension) return name;
  const base = name.replace(/\.[^.]+$/, "");
  return `${base || "image"}.${extension}`;
};

/**
 * アップロードする中身を作る。書きかけの間は切り抜く範囲を持つだけにして、ここで 1 回だけ
 * 画素を作る —— 元の画像を残しておけば、何度でも切り直せる。
 *
 * 動画と、動く画像（描き直すと 1 枚の絵になる）は、切り抜かない限りそのまま預ける。
 * それ以外は、切り抜く・撮影情報がある・重い（5MB 超）ときは必ず、長辺が 1920px を
 * 超えるときも描き直す（Web Worker の中で）。
 */
export const prepareForUpload = async (
  file: File,
  crop: CropRect | undefined,
): Promise<File> => {
  if (file.type.startsWith("video/")) return file;

  const bytes = new Uint8Array(await file.arrayBuffer());
  // 動く画像は、切ると決めたときだけ描き直す（動きは失われる。切り抜く画面で伝えている）。
  if (isAnimatedImage(bytes) && !crop) return file;

  const result = await compress({
    file,
    type: file.type,
    ...(crop ? { crop } : {}),
    force: crop !== undefined || hasExif(bytes) || file.size > MAX_BYTES,
  });
  if (!result) return file;
  return new File([result.blob], renamed(file.name, result.type), {
    type: result.type,
  });
};
