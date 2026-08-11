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
