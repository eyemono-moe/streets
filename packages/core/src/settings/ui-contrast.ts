/** 文字と背景の明るさの差。端末ごとの設定。 */
export type UiContrast = "low" | "normal" | "high";

export const UI_CONTRAST_STORAGE_KEY = "streets.v1.uiContrast";

/**
 * `uno.config.ts` の `--ui-contrast`。背景からの明るさの距離にかける倍率で、標準が 1。
 * 高くしすぎると薄い面が背景に溶けるので、1.15 / 0.85 に留めている。
 */
export const UI_CONTRAST_FACTORS: Record<UiContrast, number> = {
  low: 0.85,
  normal: 1,
  high: 1.15,
};

/** 未保存・読めない値は標準にする（コントラストを変える前の見た目）。 */
export const loadUiContrast = (raw: string | null): UiContrast =>
  raw === "low" || raw === "high" ? raw : "normal";
