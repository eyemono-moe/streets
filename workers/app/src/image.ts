import { allowedTarget } from "./ogp";

/**
 * 縮小の型。画面（apps/web/src/media/image-proxy.ts）と同じ名前にする。
 *
 * 型ごと・大きさごとに Cloudflare の無料枠（月 5,000 件のユニーク変換）を数えるので、
 * 画面が自由に大きさを選べるようにはせず、ここに決めた型だけを受ける。
 * 投稿の添付画像を縮小するときは、ここに型を足す。
 *
 * 形式は WebP に固定する。Accept を見て AVIF と出し分けると、枠を形式の数だけ
 * 使うおそれがある（1 件と数えると書かれているのは `format=auto` のときだけで、
 * Workers からは `auto` が使えない）。WebP は今のブラウザならどれも読める。
 */
export const IMAGE_PRESETS = {
  // 表示は最大 80px（プロフィールの見出し）。2 倍の画面でも粗く見えない大きさ 1 種類に揃える。
  // `crop` は縮めるだけで、元が小さいときに引き伸ばさない。
  avatar: { width: 160, height: 160, fit: "crop", format: "webp" },
} as const satisfies Record<string, RequestInitCfPropertiesImage>;

export type ImagePreset = keyof typeof IMAGE_PRESETS;

export const isImagePreset = (value: string): value is ImagePreset =>
  Object.hasOwn(IMAGE_PRESETS, value);

/**
 * 縮小してよい元画像か。Cloudflare の変換は https の元画像しか受けない。
 * 内部のアドレスを断るのは、リンクカードの取得口と同じ。
 */
export const imageSource = (input: string): URL | undefined => {
  const url = allowedTarget(input);
  return url?.protocol === "https:" ? url : undefined;
};

/**
 * 縮小できた返事か。変換を有効にしていないゾーン（`Cf-Resized` が付かない）や、
 * 枠切れ（err=9422）・画像でない元（err=9412）などは失敗として扱い、元の画像へ戻す。
 * SVG は中にスクリプトを持てるので、このドメインからは返さない。
 */
export const resized = (response: Response): boolean => {
  if (!response.ok) return false;
  const status = response.headers.get("cf-resized");
  if (!status || /err=/.test(status)) return false;
  const type = response.headers.get("content-type") ?? "";
  return type.startsWith("image/") && !type.startsWith("image/svg");
};
