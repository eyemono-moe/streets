/**
 * 投稿の時刻を、出した時刻で見せるか、いまからの相対時間で見せるか。端末ごとの設定。
 */
export type TimeFormat = "absolute" | "relative";

export const TIME_FORMAT_STORAGE_KEY = "streets.v1.timeFormat";

/** 未保存・読めない値は、出した時刻にする。 */
export const loadTimeFormat = (raw: string | null): TimeFormat =>
  raw === "relative" ? raw : "absolute";
