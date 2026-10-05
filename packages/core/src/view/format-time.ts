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

const MONTHS = [
  "JAN",
  "FEB",
  "MAR",
  "APR",
  "MAY",
  "JUN",
  "JUL",
  "AUG",
  "SEP",
  "OCT",
  "NOV",
  "DEC",
] as const;

export type TimeCircuitParts = {
  month: string;
  day: string;
  year: string;
  pm: boolean;
  hour: string;
  minute: string;
};

/** 秒を、時刻の表示板の欄（英語の月・日・年・午前午後・12 時間制の時・分）に分ける。 */
export const timeCircuitParts = (seconds: number): TimeCircuitParts => {
  const date = new Date(seconds * 1000);
  const hours = date.getHours();
  return {
    month: MONTHS[date.getMonth()] ?? "",
    day: pad(date.getDate()),
    year: String(date.getFullYear()).padStart(4, "0"),
    pm: hours >= 12,
    hour: pad(hours % 12 === 0 ? 12 : hours % 12),
    minute: pad(date.getMinutes()),
  };
};
