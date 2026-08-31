import { describe, expect, it } from "vitest";
import { loadDeveloperMode, saveDeveloperMode } from "./developer-mode";

describe("開発者モードの永続化", () => {
  it("保存したものを読み戻せる", () => {
    // 捕まえる変異: save が真偽値を落とす
    expect(loadDeveloperMode(saveDeveloperMode(true))).toBe(true);
    expect(loadDeveloperMode(saveDeveloperMode(false))).toBe(false);
  });

  it("未設定 (null) は false", () => {
    // 捕まえる変異: 既定を true にする。開発者モードの既定は無効なので、
    // それが崩れると意図せず全員に開発者向け機能が見えてしまう。
    expect(loadDeveloperMode(null)).toBe(false);
  });

  it("壊れた値は false", () => {
    // 捕まえる変異: 値の中身を見ず「キーがあれば true」にする
    expect(loadDeveloperMode("yes")).toBe(false);
    expect(loadDeveloperMode("{}")).toBe(false);
  });
});
