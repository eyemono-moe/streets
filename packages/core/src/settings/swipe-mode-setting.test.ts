import { describe, expect, it } from "vite-plus/test";
import { loadSwipeMode } from "./swipe-mode-setting";

describe("loadSwipeMode", () => {
  it("保存した「端で止まる」「切り替えない」を読む", () => {
    expect(loadSwipeMode("stop")).toBe("stop");
    expect(loadSwipeMode("off")).toBe("off");
  });

  it("未保存や読めない値は、一周する", () => {
    expect(loadSwipeMode(null)).toBe("loop");
    expect(loadSwipeMode("loop")).toBe("loop");
    expect(loadSwipeMode("menu")).toBe("loop");
  });
});
