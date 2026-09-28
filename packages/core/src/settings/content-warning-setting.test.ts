import { describe, expect, it } from "vite-plus/test";
import type { NostrEvent } from "../nostr/event";
import {
  hidesUnderWarning,
  listsUnderWarning,
  loadContentWarningMode,
  saveContentWarningMode,
} from "./content-warning-setting";

const VIEWER = "c".repeat(64);
const note = (tags: string[][], pubkey = "b".repeat(64)): NostrEvent => ({
  id: "a".repeat(64),
  pubkey,
  created_at: 1,
  kind: 1,
  tags,
  content: "",
  sig: "",
});
const warned = note([["content-warning", "nsfw"]]);
const plain = note([]);

describe("閲覧注意の設定", () => {
  it("未保存と読めない値は隠す", () => {
    expect(loadContentWarningMode(null)).toBe("hide");
    expect(loadContentWarningMode("???")).toBe("hide");
    expect(loadContentWarningMode(saveContentWarningMode("show"))).toBe("show");
    expect(loadContentWarningMode(saveContentWarningMode("exclude"))).toBe(
      "exclude",
    );
  });

  it("隠すのは show 以外で閲覧注意があるときだけ", () => {
    expect(hidesUnderWarning("hide", warned)).toBe(true);
    expect(hidesUnderWarning("exclude", warned)).toBe(true);
    expect(hidesUnderWarning("show", warned)).toBe(false);
    expect(hidesUnderWarning("hide", plain)).toBe(false);
  });

  it("exclude は閲覧注意の他人の投稿を一覧から除く", () => {
    expect(listsUnderWarning("exclude", warned, VIEWER)).toBe(false);
    expect(listsUnderWarning("exclude", plain, VIEWER)).toBe(true);
    expect(listsUnderWarning("hide", warned, VIEWER)).toBe(true);
    expect(listsUnderWarning("show", warned, VIEWER)).toBe(true);
  });

  it("自分の投稿は除かない", () => {
    const mine = note([["content-warning"]], VIEWER);
    expect(listsUnderWarning("exclude", mine, VIEWER)).toBe(true);
    expect(listsUnderWarning("exclude", mine, undefined)).toBe(false);
  });
});
