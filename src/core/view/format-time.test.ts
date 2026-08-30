import { describe, expect, it } from "vitest";
import { formatEventTime, formatEventTimeFull } from "./format-time";

describe("formatEventTime", () => {
  it("同日なら HH:mm だけを返す", () => {
    // 捕まえる変異: 常に日付付きの書式を返す（同日分岐を消す）
    const now = new Date(2024, 5, 15, 14, 30);
    const date = new Date(2024, 5, 15, 9, 5);
    expect(formatEventTime(date, now)).toBe("09:05");
  });

  it("同年・別日なら MM/dd HH:mm を返す", () => {
    // 捕まえる変異: 同日判定だけで分岐し、同日でなければ常に年まで出す
    // （同年・別日の中間分岐が無くなり、yyyy/MM/dd HH:mm になる）
    const now = new Date(2024, 5, 15, 14, 30);
    const date = new Date(2024, 6, 20, 9, 5);
    expect(formatEventTime(date, now)).toBe("07/20 09:05");
  });

  it("別年なら yyyy/MM/dd HH:mm を返す", () => {
    // 捕まえる変異: 年を落とす（年の比較・出力のどちらかが欠け、去年の投稿が
    // 今年扱いになって MM/dd HH:mm になる）
    const now = new Date(2024, 5, 15, 14, 30);
    const date = new Date(2023, 5, 15, 9, 5);
    expect(formatEventTime(date, now)).toBe("2023/06/15 09:05");
  });

  it("同月・別日は「同日」にならない", () => {
    // 捕まえる変異: 同日判定を月だけで行う（日を見ない）。
    // 6/15 を基準に 6/20 が同日扱いされ、HH:mm だけになる
    const now = new Date(2024, 5, 15, 14, 30);
    const date = new Date(2024, 5, 20, 9, 5);
    expect(formatEventTime(date, now)).toBe("06/20 09:05");
  });

  it("同じ日付の別月は「同日」にならない", () => {
    // 捕まえる変異: 同日判定を日だけで行う（月を見ない）。
    // 1/15 を基準に 2/15 が同日扱いされ、HH:mm だけになる
    const now = new Date(2024, 0, 15, 14, 30);
    const date = new Date(2024, 1, 15, 9, 5);
    expect(formatEventTime(date, now)).toBe("02/15 09:05");
  });

  it("24時間表記で時刻を返す", () => {
    // 捕まえる変異: hour12 を true にする（14:35 が 午後02:35 になる）
    const now = new Date(2024, 5, 15, 20, 0);
    const date = new Date(2024, 5, 15, 14, 35);
    expect(formatEventTime(date, now)).toBe("14:35");
  });
});

describe("formatEventTimeFull", () => {
  it("年・月・日・24時間表記の時刻をすべて含む", () => {
    // 捕まえる変異: 年を落とす、または hour12 を true にする
    // （どちらも "2024/06/15 09:05" という厳密な形から外れる）
    const date = new Date(2024, 5, 15, 9, 5);
    expect(formatEventTimeFull(date)).toBe("2024/06/15 09:05");
  });
});
