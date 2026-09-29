import { describe, expect, it } from "vite-plus/test";
import { loadDeckLayout, showsMultiColumn } from "./deck-layout-setting";

describe("loadDeckLayout", () => {
  it("保存した 1 列・複数列を読む", () => {
    expect(loadDeckLayout("single")).toBe("single");
    expect(loadDeckLayout("multi")).toBe("multi");
  });

  it("未保存や読めない値は画面幅に合わせる", () => {
    expect(loadDeckLayout(null)).toBe("auto");
    expect(loadDeckLayout("auto")).toBe("auto");
    expect(loadDeckLayout("grid")).toBe("auto");
  });
});

describe("showsMultiColumn", () => {
  it("画面幅に合わせるなら、幅で決める", () => {
    expect(showsMultiColumn("auto", true)).toBe(true);
    expect(showsMultiColumn("auto", false)).toBe(false);
  });

  it("選んだら、幅によらずその並べ方にする", () => {
    expect(showsMultiColumn("single", true)).toBe(false);
    expect(showsMultiColumn("multi", false)).toBe(true);
  });
});
