import { describe, expect, it } from "vitest";
import { createFirstRenderRecorder } from "./first-render-recorder";

describe("createFirstRenderRecorder (task-5-brief.md Step 1)", () => {
  it("最初の呼び出しでは渡した ms をそのまま返す", () => {
    const record = createFirstRenderRecorder();
    expect(record(123.45)).toBe(123.45);
  });

  it("2 回目以降の呼び出しは undefined を返す — 上書きしない", () => {
    // 捕まえる変異: `recorded` フラグを立てない、または毎回上書きして
    // 返してしまう。カラムを足すたびに値が変わる「直近のカラムが埋まった
    // 時刻」になり、初回描画の指標として意味を失う。
    const record = createFirstRenderRecorder();
    expect(record(100)).toBe(100);
    expect(record(9999)).toBeUndefined();
    expect(record(1)).toBeUndefined();
  });

  it("複数のカラムがほぼ同時に埋まっても、最初の 1 回だけが値を持つ", () => {
    // 3 カラムが前後して items().length > 0 になる状況を模す。
    const record = createFirstRenderRecorder();
    const results = [record(50), record(51), record(52)];
    expect(results).toEqual([50, undefined, undefined]);
  });

  it("レコーダごとに独立した状態を持つ (グローバルな可変状態を共有しない)", () => {
    const a = createFirstRenderRecorder();
    const b = createFirstRenderRecorder();
    expect(a(10)).toBe(10);
    // b はまだ 1 回も呼ばれていないので、a が記録済みでも影響を受けない。
    expect(b(20)).toBe(20);
  });
});
