import type { Message } from "../i18n/message";

/**
 * ダークの背景を、文字の白へ寄せる割合。0 で今の黒、1 で文字と同じ白。端末ごとの設定。
 * 寄せる範囲は背景から白までなので、文字の明るさはほとんど変わらない。
 */
export type DarkBackground = number;

export const DARK_BACKGROUND_STORAGE_KEY = "streets.v1.darkBackground";

export const DARK_BACKGROUND_DEFAULT: DarkBackground = 0;
export const DARK_BACKGROUND_MIN = 0;
export const DARK_BACKGROUND_MAX = 0.3;
export const DARK_BACKGROUND_STEP = 0.05;

const snap = (value: number): DarkBackground => {
  const steps = Math.round(
    (value - DARK_BACKGROUND_MIN) / DARK_BACKGROUND_STEP,
  );
  // 0.05 刻みの足し算は 0.15000000000000002 のような誤差が出るので、丸めて返す。
  return Number(
    (DARK_BACKGROUND_MIN + steps * DARK_BACKGROUND_STEP).toFixed(2),
  );
};

/** 未保存・読めない値・範囲外は標準にする。刻みの間は近い刻みに丸める。 */
export const loadDarkBackground = (raw: string | null): DarkBackground => {
  if (raw === null || raw.trim() === "") return DARK_BACKGROUND_DEFAULT;
  const value = Number(raw);
  if (
    !Number.isFinite(value) ||
    value < DARK_BACKGROUND_MIN ||
    value > DARK_BACKGROUND_MAX
  )
    return DARK_BACKGROUND_DEFAULT;
  return snap(value);
};

/** 設定に出す値の表記。標準（今の黒）からどれだけ寄せたかを割合で示す。 */
export const formatDarkBackground = (
  value: DarkBackground,
): Message | string => {
  const percent = Math.round(value * 100);
  if (percent === 0) return { key: "display.darkBackground.standard" };
  return `+${percent}%`;
};
