import { createRoot } from "solid-js";
import { describe, expect, it } from "vitest";
import { ThreadNavProvider, useThreadNav } from "./thread-nav";

describe("useThreadNav", () => {
  it("provider の外では undefined を返す", () => {
    // 捕まえる変異: useRender と同じく例外を投げる。投げると
    // /debug/v1-section のようにナビゲーションを持たない面が、
    // スレッドと無関係に落ちる。
    createRoot((dispose) => {
      expect(useThreadNav()).toBeUndefined();
      dispose();
    });
  });

  it("provider の中では渡された関数を返す", () => {
    // 捕まえる変異: 常に undefined を返す（ノートが永久に押せない）。
    //
    // JSX を書くだけでは child が評価されない (式文として捨てられる) ので、
    // provider をコンポーネント関数として直接呼び、`children` getter の
    // 中で子を実際に走らせる。
    const opened: string[] = [];
    createRoot((dispose) => {
      const Child = () => {
        useThreadNav()?.("abc");
        return null;
      };
      let ran = false;
      ThreadNavProvider({
        open: (id) => opened.push(id),
        get children() {
          ran = true;
          return Child();
        },
      });
      expect(ran).toBe(true);
      dispose();
    });
    expect(opened).toEqual(["abc"]);
  });
});
