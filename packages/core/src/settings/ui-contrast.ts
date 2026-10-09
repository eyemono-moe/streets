/** 文字と背景の明るさの差の倍率。標準が 1。端末ごとの設定。 */
export type UiContrast = number;

export const UI_CONTRAST_STORAGE_KEY = "streets.v1.uiContrast";

export const UI_CONTRAST_DEFAULT: UiContrast = 1;
export const UI_CONTRAST_MIN = 0.8;
export const UI_CONTRAST_MAX = 1.2;
export const UI_CONTRAST_STEP = 0.05;

const snap = (value: number): UiContrast => {
  const steps = Math.round((value - UI_CONTRAST_MIN) / UI_CONTRAST_STEP);
  // 0.05 刻みの足し算は 1.0000000000000002 のような誤差が出るので、丸めて返す。
  return Number((UI_CONTRAST_MIN + steps * UI_CONTRAST_STEP).toFixed(2));
};

/** 未保存・読めない値・範囲外は標準にする。刻みの間は近い刻みに丸める。 */
export const loadUiContrast = (raw: string | null): UiContrast => {
  if (raw === null || raw.trim() === "") return UI_CONTRAST_DEFAULT;
  const value = Number(raw);
  if (
    !Number.isFinite(value) ||
    value < UI_CONTRAST_MIN ||
    value > UI_CONTRAST_MAX
  )
    return UI_CONTRAST_DEFAULT;
  return snap(value);
};

/** 設定に出す値の表記。標準からの差を割合で示す。 */
export const formatUiContrast = (contrast: UiContrast): string => {
  const percent = Math.round((contrast - UI_CONTRAST_DEFAULT) * 100);
  if (percent === 0) return "標準";
  return `${percent > 0 ? "+" : "-"}${Math.abs(percent)}%`;
};
