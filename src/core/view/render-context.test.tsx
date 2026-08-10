import { createRoot } from "solid-js";
import { describe, expect, it } from "vitest";
import { useRender } from "./render-context";

describe("useRender", () => {
  it("provider の外で呼ぶと投げる", () => {
    // 捕まえる変異: provider が無いとき `undefined` を返して呼び出し側に
    // 分岐させる。そうすると `RenderProvider` の付け忘れが**実行時の静かな
    // 未描画**になる —— カラムは空のまま、エラーも出ず、原因は
    // `EventView` から遠く離れた `/v1.tsx` の配線にある。投げれば
    // 開発中に必ず気づく (このアプリに ErrorBoundary は無いので、
    // 白画面という最も分かりやすい形で出る)。
    createRoot((dispose) => {
      expect(() => useRender()).toThrow();
      dispose();
    });
  });
});
