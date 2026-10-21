import { describe, expect, it } from "vite-plus/test";
import {
  formatEventTime,
  formatEventTimeFull,
  formatRelativeEventTime,
  fromDateTimeLocal,
  timeCircuitParts,
  toDateTimeLocal,
} from "./format-time";

describe("formatEventTime", () => {
  it("同日なら HH:mm だけを返す", () => {
    // 捕まえる変異: 常に日付付きの書式を返す（同日分岐を消す）
    const now = new Date(2024, 5, 15, 14, 30);
    const date = new Date(2024, 5, 15, 9, 5);
    expect(formatEventTime(date, now, "ja")).toBe("09:05");
  });

  it("同年・別日なら MM/dd HH:mm を返す", () => {
    // 捕まえる変異: 同日判定だけで分岐し、同日でなければ常に年まで出す（yyyy/MM/dd HH:mm になる）。
    const now = new Date(2024, 5, 15, 14, 30);
    const date = new Date(2024, 6, 20, 9, 5);
    expect(formatEventTime(date, now, "ja")).toBe("07/20 09:05");
  });

  it("別年なら yyyy/MM/dd HH:mm を返す", () => {
    // 捕まえる変異: 年を落とす（去年の投稿が今年扱いになり MM/dd HH:mm になる）。
    const now = new Date(2024, 5, 15, 14, 30);
    const date = new Date(2023, 5, 15, 9, 5);
    expect(formatEventTime(date, now, "ja")).toBe("2023/06/15 09:05");
  });

  it("同月・別日は「同日」にならない", () => {
    // 捕まえる変異: 同日判定を月だけで行う（日を見ないと 6/20 が同日扱いされ HH:mm だけになる）。
    const now = new Date(2024, 5, 15, 14, 30);
    const date = new Date(2024, 5, 20, 9, 5);
    expect(formatEventTime(date, now, "ja")).toBe("06/20 09:05");
  });

  it("同じ日付の別月は「同日」にならない", () => {
    // 捕まえる変異: 同日判定を日だけで行う（月を見ないと 2/15 が同日扱いされ HH:mm だけになる）。
    const now = new Date(2024, 0, 15, 14, 30);
    const date = new Date(2024, 1, 15, 9, 5);
    expect(formatEventTime(date, now, "ja")).toBe("02/15 09:05");
  });

  it("24時間表記で時刻を返す", () => {
    // 捕まえる変異: hour12 を true にする（14:35 が 午後02:35 になる）
    const now = new Date(2024, 5, 15, 20, 0);
    const date = new Date(2024, 5, 15, 14, 35);
    expect(formatEventTime(date, now, "ja")).toBe("14:35");
  });
});

describe("formatEventTimeFull", () => {
  it("年・月・日・24時間表記の時刻をすべて含む", () => {
    // 捕まえる変異: 年を落とす、または hour12 を true にする（"2024/06/15 09:05" の厳密な形から外れる）。
    const date = new Date(2024, 5, 15, 9, 5);
    expect(formatEventTimeFull(date, "ja")).toBe("2024/06/15 09:05");
  });
});

describe("toDateTimeLocal / fromDateTimeLocal", () => {
  it("分までの値に直し、戻すとその分の終わりになる", () => {
    const seconds = new Date(2026, 9, 1, 12, 34, 56).getTime() / 1000;
    const value = toDateTimeLocal(seconds);
    expect(value).toBe("2026-10-01T12:34");
    expect(fromDateTimeLocal(value)).toBe(
      new Date(2026, 9, 1, 12, 34, 59).getTime() / 1000,
    );
  });

  it("空や読めない値は無い", () => {
    expect(fromDateTimeLocal("")).toBeUndefined();
    expect(fromDateTimeLocal("きのう")).toBeUndefined();
  });
});

describe("timeCircuitParts", () => {
  it("英語の月と 12 時間制に分ける", () => {
    const at = (h: number, m: number) =>
      new Date(1985, 9, 26, h, m).getTime() / 1000;
    expect(timeCircuitParts(at(1, 21))).toEqual({
      month: "OCT",
      day: "26",
      year: "1985",
      pm: false,
      hour: "01",
      minute: "21",
    });
    // 捕まえる変異: 0 時・12 時を 00 と出す
    expect(timeCircuitParts(at(0, 0))).toMatchObject({ pm: false, hour: "12" });
    expect(timeCircuitParts(at(12, 0))).toMatchObject({ pm: true, hour: "12" });
  });
});

describe("formatRelativeEventTime", () => {
  const now = new Date(2026, 9, 9, 12, 0, 0);
  const ago = (ms: number) => new Date(now.getTime() - ms);
  const relative = (ms: number) => formatRelativeEventTime(ago(ms), now, "ja");

  it("1 分未満は「いま」", () => {
    expect(relative(59_000)).toEqual({ key: "time.relative.now" });
  });

  it("未来の時刻も「いま」", () => {
    expect(relative(-120_000)).toEqual({ key: "time.relative.now" });
  });

  it("1 時間未満は切り捨てた分", () => {
    expect(relative(60_000)).toEqual({
      key: "time.relative.minutes",
      args: { value: 1 },
    });
    expect(relative(59 * 60_000 + 59_000)).toEqual({
      key: "time.relative.minutes",
      args: { value: 59 },
    });
  });

  it("1 日未満は切り捨てた時間", () => {
    expect(relative(60 * 60_000)).toEqual({
      key: "time.relative.hours",
      args: { value: 1 },
    });
    expect(relative(23 * 3_600_000 + 59 * 60_000)).toEqual({
      key: "time.relative.hours",
      args: { value: 23 },
    });
  });

  it("1 日以上前は日付の表示にする", () => {
    const old = ago(24 * 3_600_000);
    expect(formatRelativeEventTime(old, now, "ja")).toBe(
      formatEventTime(old, now, "ja"),
    );
  });
});

describe("英語の表示", () => {
  it("0 時は 24 時ではなく 00 時と書く", () => {
    const now = new Date(2024, 5, 15, 14, 30);
    expect(formatEventTime(new Date(2024, 5, 15, 0, 5), now, "en")).toBe(
      "00:05",
    );
  });
});
