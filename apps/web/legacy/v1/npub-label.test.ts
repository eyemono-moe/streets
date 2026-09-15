import { describe, expect, it } from "vitest";
import { npubLabel } from "./npub-label";

describe("npubLabel", () => {
  it("64 桁 hex は npub の先頭 12 文字", () => {
    // 捕まえる変異: slice を外して npub を丸ごと返す (63 文字が名前の
    // 位置に出て、行が崩れる)
    expect(npubLabel("a".repeat(64))).toBe("npub14242424");
  });

  it("hex として読めない値でも投げない", () => {
    // 捕まえる変異: try/catch を外す。pubkey はリレー由来の任意文字列
    // から来ることがあり、投げるとカラム全体が落ちる。
    expect(() => npubLabel("not-a-hex")).not.toThrow();
    expect(npubLabel("not-a-hex")).toBe("not-a-he…");
  });
});
