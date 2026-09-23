import type { Ago, When } from "./define";

const UNIT_SECONDS = { s: 1, m: 60, h: 3600, d: 86_400 } as const;

/** `"2m"` や `"1h30m"` のような書き方を秒にする。 */
export const agoSeconds = (ago: Ago): number => {
  if (!/^(\d+(?:\.\d+)?[smhd])+$/.test(ago)) {
    throw new Error(`時間の書き方が読めません: ${ago}`);
  }
  let seconds = 0;
  for (const [, amount = "0", unit = "s"] of ago.matchAll(
    /(\d+(?:\.\d+)?)([smhd])/g,
  )) {
    seconds += Number(amount) * UNIT_SECONDS[unit as keyof typeof UNIT_SECONDS];
  }
  return Math.round(seconds);
};

/** 基準時刻（UNIX 秒）から、その出来事の時刻を決める。 */
export const resolveTime = (base: number, when: When): number =>
  "ago" in when ? base - agoSeconds(when.ago) : base + when.offset;

/** `--time` の値を UNIX 秒にする。省けば今。 */
export const parseBaseTime = (value: string | undefined): number => {
  if (value === undefined) return Math.floor(Date.now() / 1000);
  const millis = Date.parse(value);
  if (Number.isNaN(millis)) throw new Error(`--time が読めません: ${value}`);
  return Math.floor(millis / 1000);
};
