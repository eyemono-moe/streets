/**
 * 数字キー（1〜9）で、左から数えたカラムを見せるか。端末ごとの設定 ——
 * キーボードの有無は、その端末の事情だから。
 */
export const COLUMN_DIGITS_STORAGE_KEY = "streets.v1.columnDigits";

/** 未保存・読めない値は使う（既定は有効）。 */
export const loadColumnDigits = (raw: string | null): boolean => raw !== "off";

export const saveColumnDigits = (on: boolean): string => (on ? "on" : "off");
