import { describe, expect, it } from "vitest";
import {
  DEFAULT_KEYMAP,
  type Keymap,
  conflictingAction,
  loadKeymap,
  saveKeymap,
} from "./keymap";

describe("loadKeymap", () => {
  it("未保存なら既定", () => {
    expect(loadKeymap(null)).toEqual(DEFAULT_KEYMAP);
  });

  it("保存した割り当てで既定を上書きする", () => {
    expect(loadKeymap('{"compose":"Mod+[KeyJ]"}')).toEqual({
      ...DEFAULT_KEYMAP,
      compose: "Mod+[KeyJ]",
    });
  });

  it("空文字は「使わない」として残す", () => {
    // 捕まえる変異: 空を落として既定に戻す（切ったつもりのキーが復活する）
    expect(loadKeymap('{"search":""}').search).toBe("");
  });

  it("壊れた値でも、読める分だけ活かす", () => {
    // 捕まえる変異: 1 つでも読めなければ全部既定に戻す（別の割り当てまで消える）
    expect(
      loadKeymap('{"compose":"[KeyJ]","search":42,"nope":"[KeyZ]"}'),
    ).toEqual({ ...DEFAULT_KEYMAP, compose: "[KeyJ]" });
  });

  it("JSON でない文字列は既定", () => {
    expect(loadKeymap("{")).toEqual(DEFAULT_KEYMAP);
    expect(loadKeymap('"[KeyN]"')).toEqual(DEFAULT_KEYMAP);
  });
});

describe("saveKeymap", () => {
  it("既定から変えたものだけ書く", () => {
    // 捕まえる変異: 全部書く（既定を変えても、変えていない人へ届かなくなる）
    const keymap: Keymap = { ...DEFAULT_KEYMAP, search: "[KeyF]" };
    expect(JSON.parse(saveKeymap(keymap))).toEqual({ search: "[KeyF]" });
  });

  it("書いたものは読み戻せる", () => {
    const keymap: Keymap = {
      ...DEFAULT_KEYMAP,
      compose: "Mod+[KeyJ]",
      search: "",
    };
    expect(loadKeymap(saveKeymap(keymap))).toEqual(keymap);
  });
});

describe("conflictingAction", () => {
  it("同じキーを使っている別の action を返す", () => {
    expect(conflictingAction(DEFAULT_KEYMAP, "compose", "[KeyS]")).toBe(
      "search",
    );
    expect(
      conflictingAction(DEFAULT_KEYMAP, "compose", "[KeyJ]"),
    ).toBeUndefined();
  });

  it("自分自身は衝突としない", () => {
    // 捕まえる変異: action を見ない（同じキーを選び直せなくなる）
    expect(
      conflictingAction(DEFAULT_KEYMAP, "search", "[KeyS]"),
    ).toBeUndefined();
  });

  it("「使わない」同士は衝突としない", () => {
    // 捕まえる変異: 空文字も比べる（2 つ切ると衝突扱いになる）
    const keymap: Keymap = { ...DEFAULT_KEYMAP, compose: "", search: "" };
    expect(conflictingAction(keymap, "compose", "")).toBeUndefined();
  });
});
