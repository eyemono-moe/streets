import { describe, expect, it } from "vite-plus/test";
import { buildNote } from "./note";
describe("buildNote", () => {
  it("本文のハッシュタグを t タグにする", () => {
    // 捕まえる変異: t タグを付けない（自分の投稿がハッシュタグのカラムに出ない）
    expect(buildNote("#Nostr と #streets の話").tags).toEqual([
      ["t", "nostr"],
      ["t", "streets"],
    ]);
  });

  it("日本語の長いハッシュタグも t タグにする", () => {
    expect(buildNote("#東京Nostr散歩2026 に参加").tags).toEqual([
      ["t", "東京nostr散歩2026"],
    ]);
  });

  it("同じハッシュタグは 1 回だけ", () => {
    expect(buildNote("#nostr #nostr").tags).toEqual([["t", "nostr"]]);
  });

  it("ハッシュタグが無ければタグも無い", () => {
    expect(buildNote("ただの本文")).toEqual({
      kind: 1,
      tags: [],
      content: "ただの本文",
    });
  });
});
