import { describe, expect, it } from "vite-plus/test";
import { loadColorScheme } from "./color-scheme";

describe("loadColorScheme", () => {
  it("保存したライト・ダークを読む", () => {
    expect(loadColorScheme("light")).toBe("light");
    expect(loadColorScheme("dark")).toBe("dark");
  });

  it("未保存や読めない値は OS に合わせる", () => {
    expect(loadColorScheme(null)).toBe("system");
    expect(loadColorScheme("system")).toBe("system");
    expect(loadColorScheme("sepia")).toBe("system");
  });
});
