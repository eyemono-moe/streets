import { describe, expect, it } from "vite-plus/test";
import { buildThreadColumn, buildUserColumn } from "./column-presets";
import {
  type ColumnStackEvent,
  type ColumnStackState,
  columnStackTransition,
  emptyColumnStack,
  openLayers,
} from "./column-stack";

const run = (...events: ColumnStackEvent[]): ColumnStackState =>
  events.reduce(columnStackTransition, emptyColumnStack());

const thread = buildThreadColumn("a".repeat(64));
const user = buildUserColumn("b".repeat(64));

describe("columnStackTransition", () => {
  it("開くたびに一番上へ積む", () => {
    const state = run(
      { type: "stack/open", column: thread },
      { type: "stack/open", column: user },
    );
    expect(openLayers(state).map((layer) => layer.column.id)).toEqual([
      thread.id,
      user.id,
    ]);
  });

  it("一番上と同じカラムは重ねない", () => {
    const state = run(
      { type: "stack/open", column: thread },
      { type: "stack/open", column: thread },
    );
    expect(state.layers).toHaveLength(1);
  });

  it("一番上でなければ、同じカラムでも重ねる", () => {
    const state = run(
      { type: "stack/open", column: thread },
      { type: "stack/open", column: user },
      { type: "stack/open", column: thread },
    );
    expect(openLayers(state)).toHaveLength(3);
  });

  it("戻ると一番上だけを閉じ、閉じる動きが終わるまでは残す", () => {
    const state = run(
      { type: "stack/open", column: thread },
      { type: "stack/open", column: user },
      { type: "stack/back" },
    );
    expect(state.layers.map((layer) => layer.open)).toEqual([true, false]);
    expect(openLayers(state).map((layer) => layer.column.id)).toEqual([
      thread.id,
    ]);
  });

  it("続けて戻ると、開いている次の段を閉じる", () => {
    const state = run(
      { type: "stack/open", column: thread },
      { type: "stack/open", column: user },
      { type: "stack/back" },
      { type: "stack/back" },
    );
    expect(state.layers.map((layer) => layer.open)).toEqual([false, false]);
  });

  it("閉じる動きが終わった段だけを外す", () => {
    const opened = run(
      { type: "stack/open", column: thread },
      { type: "stack/open", column: user },
      { type: "stack/back" },
    );
    const closingKey = opened.layers[1]?.key ?? -1;
    const state = columnStackTransition(opened, {
      type: "stack/closed",
      key: closingKey,
    });
    expect(state.layers.map((layer) => layer.column.id)).toEqual([thread.id]);
  });

  it("開いている段には、閉じ終わりが届いても外さない", () => {
    const opened = run({ type: "stack/open", column: thread });
    const key = opened.layers[0]?.key ?? -1;
    expect(columnStackTransition(opened, { type: "stack/closed", key })).toBe(
      opened,
    );
  });

  it("閉じている途中の段と同じカラムを開くと、新しい段として積む", () => {
    const state = run(
      { type: "stack/open", column: thread },
      { type: "stack/back" },
      { type: "stack/open", column: thread },
    );
    expect(state.layers.map((layer) => layer.open)).toEqual([false, true]);
    expect(new Set(state.layers.map((layer) => layer.key)).size).toBe(2);
  });

  it("開いている段が無ければ、戻っても何も変えない", () => {
    const empty = emptyColumnStack();
    expect(columnStackTransition(empty, { type: "stack/back" })).toBe(empty);
  });

  it("何も重ねていない状態は、呼ぶたびに別のオブジェクトになる", () => {
    const a = emptyColumnStack();
    const b = emptyColumnStack();
    expect(a).not.toBe(b);
    expect(a.layers).not.toBe(b.layers);
  });
});
