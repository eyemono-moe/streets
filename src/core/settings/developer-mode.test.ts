import { describe, expect, it } from "vitest";
import { loadDeveloperMode, saveDeveloperMode } from "./developer-mode";

describe("開発者モードの永続化", () => {
  it("保存したものを読み戻せる", () => {
    // 捕まえる変異: save が真偽値を落とす
    expect(loadDeveloperMode(saveDeveloperMode(true))).toBe(true);
    expect(loadDeveloperMode(saveDeveloperMode(false))).toBe(false);
  });

  it("未設定 (null) は false", () => {
    // 捕まえる変異: 既定を true にする。ADR-0026 は「既定は無効」と決めて
    // いる —— 既定で出ていたら、そもそもこの ADR が要らない。
    expect(loadDeveloperMode(null)).toBe(false);
  });

  it("壊れた値は false", () => {
    // 捕まえる変異: 値の中身を見ず「キーがあれば true」にする
    expect(loadDeveloperMode("yes")).toBe(false);
    expect(loadDeveloperMode("{}")).toBe(false);
  });
});
