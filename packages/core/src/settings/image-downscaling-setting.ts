/** 投稿の画像とプロフィールのヘッダー画像を、表示する大きさに縮めるか。 */
export const IMAGE_DOWNSCALING_STORAGE_KEY = "streets.v1.imageDownscaling";

/** 保存していない端末では、従来どおり縮める。 */
export const loadImageDownscaling = (raw: string | null): boolean =>
  raw !== "off";

export const saveImageDownscaling = (on: boolean): string =>
  on ? "on" : "off";
