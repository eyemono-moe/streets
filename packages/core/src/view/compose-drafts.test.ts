import { describe, expect, it } from "vite-plus/test";
import {
  AUTO_DRAFT_LIMIT,
  type ComposeDraft,
  loadComposeDrafts,
  putDraft,
  removeDraft,
  saveComposeDrafts,
} from "./compose-drafts";

const draft = (
  id: string,
  savedAt: number,
  extra: Partial<ComposeDraft> = {},
): ComposeDraft => ({ id, content: id, savedAt, kept: false, ...extra });

describe("putDraft", () => {
  it("新しい順に並べる", () => {
    const drafts = putDraft([draft("a", 1)], draft("b", 2));
    expect(drafts.map((d) => d.id)).toEqual(["b", "a"]);
  });

  it("同じ id のものは差し替える", () => {
    const drafts = putDraft(
      [draft("a", 1), draft("b", 2)],
      draft("a", 3, { content: "直した" }),
    );
    expect(drafts.map((d) => [d.id, d.content])).toEqual([
      ["a", "直した"],
      ["b", "b"],
    ]);
  });

  it("自動で残したものは、古いものから件数を超えた分を消す", () => {
    let drafts: ComposeDraft[] = [];
    for (let i = 0; i < AUTO_DRAFT_LIMIT + 2; i++) {
      drafts = putDraft(drafts, draft(`auto${i}`, i));
    }
    expect(drafts).toHaveLength(AUTO_DRAFT_LIMIT);
    expect(drafts.at(-1)?.id).toBe("auto2");
  });

  it("自分で入れたものは件数に数えず、消さない", () => {
    let drafts = [draft("kept", 0, { kept: true })];
    for (let i = 1; i <= AUTO_DRAFT_LIMIT + 1; i++) {
      drafts = putDraft(drafts, draft(`auto${i}`, i));
    }
    expect(drafts.filter((d) => !d.kept)).toHaveLength(AUTO_DRAFT_LIMIT);
    expect(drafts.some((d) => d.id === "kept")).toBe(true);
  });

  it("渡した配列を書き換えない", () => {
    const before = [draft("a", 1)];
    putDraft(before, draft("a", 2));
    expect(before[0]?.savedAt).toBe(1);
  });
});

describe("removeDraft", () => {
  it("その id だけを外す", () => {
    expect(
      removeDraft([draft("a", 1), draft("b", 2)], "a").map((d) => d.id),
    ).toEqual(["b"]);
  });
});

describe("loadComposeDrafts", () => {
  it("未保存・読めない値は空", () => {
    expect(loadComposeDrafts(null)).toEqual([]);
    expect(loadComposeDrafts("{")).toEqual([]);
    expect(loadComposeDrafts('{"a":1}')).toEqual([]);
  });

  it("壊れた 1 件だけを捨て、新しい順に並べる", () => {
    const raw = JSON.stringify([
      draft("a", 1),
      { id: "broken" },
      draft("b", 2, { contentWarning: "ネタバレ" }),
    ]);
    expect(loadComposeDrafts(raw)).toEqual([
      draft("b", 2, { contentWarning: "ネタバレ" }),
      draft("a", 1),
    ]);
  });

  it("保存したものをそのまま読める", () => {
    const drafts = [draft("b", 2, { kept: true }), draft("a", 1)];
    expect(loadComposeDrafts(saveComposeDrafts(drafts))).toEqual(drafts);
  });
});
