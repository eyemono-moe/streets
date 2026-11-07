import type { Message } from "../i18n/message";

/** 背景の明るさの設定を分けて持つテーマ。 */
export type BackgroundScheme = "light" | "dark";

/**
 * 背景を文字の色の側へ寄せる割合に、向きの符号を付けたもの。0 が標準（白・黒のまま）。
 * ダークは明るくする向きだけ（0〜+）、ライトは暗くする向きだけ（-〜0）を取る。
 * 端末ごと・テーマごとの設定。
 */
export type BackgroundBrightness = number;

export const BACKGROUND_BRIGHTNESS_DEFAULT: BackgroundBrightness = 0;
export const BACKGROUND_BRIGHTNESS_STEP = 0.01;
/**
 * ライトの端をダークより狭くするのは、白から下げると、アクセントの色（リンクなど）と背景の明るさが
 * 先に近づくため。-30% ではリンクが背景に埋もれた。
 */
const LIMITS = { light: 0.15, dark: 0.3 } as const;

export const backgroundBrightnessRange = (
  scheme: BackgroundScheme,
): { min: number; max: number } =>
  scheme === "dark"
    ? { min: 0, max: LIMITS.dark }
    : { min: -LIMITS.light, max: 0 };

export const backgroundBrightnessStorageKey = (scheme: BackgroundScheme) =>
  `streets.v1.backgroundBrightness.${scheme}`;

/** 未保存・読めない値・そのテーマで取れない向きは標準にする。刻みの間は近い刻みに丸める。 */
export const loadBackgroundBrightness = (
  scheme: BackgroundScheme,
  raw: string | null,
): BackgroundBrightness => {
  if (raw === null || raw.trim() === "") return BACKGROUND_BRIGHTNESS_DEFAULT;
  const value = Number(raw);
  const { min, max } = backgroundBrightnessRange(scheme);
  if (!Number.isFinite(value) || value < min || value > max)
    return BACKGROUND_BRIGHTNESS_DEFAULT;
  // 0.01 刻みの割り算は 0.07000000000000001 のような誤差が出るので、丸めて返す。
  // `+ 0` は -0 を 0 にする（-0 は既定と比べても等しいが、保存すると "0" と "-0" に分かれる）。
  return (
    Number(
      (
        Math.round(value / BACKGROUND_BRIGHTNESS_STEP) *
        BACKGROUND_BRIGHTNESS_STEP
      ).toFixed(2),
    ) + 0
  );
};

/** 背景をどれだけ寄せるか（`--ui-lift`）。向きはテーマで決まるので、大きさだけを渡す。 */
export const backgroundLift = (value: BackgroundBrightness): number =>
  Math.abs(value);

/** 設定に出す値の表記。標準からの明るさの変化を割合で示す。 */
export const formatBackgroundBrightness = (
  value: BackgroundBrightness,
): Message | string => {
  const percent = Math.round(value * 100);
  if (percent === 0) return { key: "display.backgroundBrightness.standard" };
  return `${percent > 0 ? "+" : "-"}${Math.abs(percent)}%`;
};
