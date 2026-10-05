// ロケールを固定する。実行環境のロケールに従うと、同じ入力でも
// CI と手元で表示が食い違う。
const LOCALE = "ja-JP";

const isSameDay = (a: Date, b: Date): boolean =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

const isSameYear = (a: Date, b: Date): boolean =>
  a.getFullYear() === b.getFullYear();

/** 同日は `HH:mm`、同年は `MM/dd HH:mm`、それ以外は `yyyy/MM/dd HH:mm`。 */
export const formatEventTime = (date: Date, now: Date): string => {
  if (isSameDay(date, now)) {
    return date.toLocaleString(LOCALE, {
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  if (isSameYear(date, now)) {
    return date.toLocaleString(LOCALE, {
      month: "2-digit",
      day: "2-digit",
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  return date.toLocaleString(LOCALE, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
  });
};

/** `title` 属性用の完全な日時。 */
export const formatEventTimeFull = (date: Date): string =>
  date.toLocaleString(LOCALE, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
  });

const pad = (value: number): string => String(value).padStart(2, "0");

/** 秒を `<input type="datetime-local">` の値（端末の時刻、分まで）にする。 */
export const toDateTimeLocal = (seconds: number): string => {
  const date = new Date(seconds * 1000);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

/**
 * `<input type="datetime-local">` の値を秒にする。分までしか選べないので、その分の
 * 終わり（59 秒）にする —— 12:34 を選んだ人は 12:34 台の投稿も見たい。読めなければ無い。
 */
export const fromDateTimeLocal = (value: string): number | undefined => {
  const time = new Date(value).getTime();
  if (value === "" || Number.isNaN(time)) return undefined;
  return Math.floor(time / 60_000) * 60 + 59;
};
