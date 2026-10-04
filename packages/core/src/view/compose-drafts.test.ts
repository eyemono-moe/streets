import { describe, expect, it } from "vite-plus/test";
import type { NostrEvent } from "../nostr/event";
import {
  AUTO_DRAFT_LIMIT,
  type ComposeDraft,
  draftFor,
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

const note = (seed: string): NostrEvent => ({
  id: seed.repeat(64),
  pubkey: "b".repeat(64),
  created_at: 1,
  kind: 1,
  tags: [],
  content: "宛先",
  sig: "c".repeat(128),
});

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

describe("draftFor", () => {
  it("同じ投稿へ同じ形で書いた、いちばん新しい下書きを返す", () => {
    const drafts = [
      draft("old", 1, { target: { type: "reply", event: note("a") } }),
      draft("new", 3, { target: { type: "reply", event: note("a") } }),
      draft("quote", 4, { target: { type: "quote", event: note("a") } }),
      draft("other", 5, { target: { type: "reply", event: note("d") } }),
      draft("plain", 6),
    ];
    expect(draftFor(drafts, { type: "reply", event: note("a") })?.id).toBe(
      "new",
    );
    expect(draftFor(drafts, { type: "quote", event: note("d") })).toBe(
      undefined,
    );
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
      draft("bad-target", 3, {
        target: { type: "reply", event: { ...note("a"), id: "x" } },
      }),
      draft("b", 2, { contentWarning: "ネタバレ" }),
    ]);
    expect(loadComposeDrafts(raw)).toEqual([
      draft("b", 2, { contentWarning: "ネタバレ" }),
      draft("a", 1),
    ]);
  });

  it("保存したものをそのまま読める", () => {
    const drafts = [
      draft("b", 2, { kept: true }),
      draft("a", 1, { target: { type: "quote", event: note("a") } }),
    ];
    expect(loadComposeDrafts(saveComposeDrafts(drafts))).toEqual(drafts);
  });
});
