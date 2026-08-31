import { createRoot } from "solid-js";
import { describe, expect, it } from "vitest";
import { useRender } from "./render-context";

describe("useRender", () => {
  it("provider の外で呼ぶと投げる", () => {
    // 捕まえる変異: provider が無いとき `undefined` を返して呼び出し側に
    // 分岐させる。原因が `EventView` から遠い `/v1.tsx` の配線にあっても、
    // 投げれば開発中に必ず気づく（ErrorBoundary が無いので白画面で気づく）。
    createRoot((dispose) => {
      expect(() => useRender()).toThrow();
      dispose();
    });
  });
});
