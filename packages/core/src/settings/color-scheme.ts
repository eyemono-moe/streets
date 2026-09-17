/** ライト／ダーク／OS に合わせる。 */
export type ColorScheme = "system" | "light" | "dark";

/**
 * カラーテーマは**端末ごと**の設定。PC はダーク、スマホは OS に合わせる、のように
 * 端末で変えたいことが多いので、アカウント（NIP-78）には入れない。
 */
export const COLOR_SCHEME_STORAGE_KEY = "streets.v1.colorScheme";

/** 読めない値や未保存は、OS に合わせる。 */
export const loadColorScheme = (raw: string | null): ColorScheme =>
  raw === "light" || raw === "dark" ? raw : "system";
