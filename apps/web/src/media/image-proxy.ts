/**
 * 縮小の型。Worker（workers/app/src/image.ts の `IMAGE_PRESETS`）と同じ名前にする。
 * 大きさは Worker が型ごとに決める。投稿の添付画像を縮小するときは、両方に型を足す。
 */
export type ImagePreset = "avatar";

/**
 * 縮小して配る URL。縮小できない元（http や、このサイト自身の画像）は `undefined` を
 * 返すので、元の URL をそのまま使う。縮小に失敗したときは Worker が元の画像へ飛ばすが、
 * それでも読めなければ、呼ぶ側で元の URL に戻す。
 */
export const resizedImageUrl = (
  source: string,
  preset: ImagePreset,
): string | undefined => {
  let url: URL;
  try {
    url = new URL(source);
  } catch {
    return undefined;
  }
  // Cloudflare の変換は https の元しか受けない。ストーリーの固定の画像は同じサイトにある。
  if (url.protocol !== "https:" || url.origin === location.origin) {
    return undefined;
  }
  const params = new URLSearchParams({ preset, url: source });
  return `/api/image?${params}`;
};
