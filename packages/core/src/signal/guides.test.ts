import { describe, expect, it } from "vite-plus/test";
import {
  GUIDE_CATEGORIES,
  GUIDES,
  guideById,
  guideByPath,
  guideCategoryByPath,
  guidesInCategory,
} from "./guides";

describe("Signal Guide", () => {
  it("ID と公開 URL が一意で、双方から同じ Guide を引ける", () => {
    expect(new Set(GUIDES.map((guide) => guide.id)).size).toBe(GUIDES.length);
    expect(new Set(GUIDES.map((guide) => guide.path)).size).toBe(GUIDES.length);
    for (const guide of GUIDES) {
      expect(guideById(guide.id)).toBe(guide);
      expect(guideByPath(guide.path)).toBe(guide);
      expect(guide.content.length).toBeGreaterThan(0);
      expect(guide.content.every((paragraph) => paragraph.length > 0)).toBe(
        true,
      );
    }
  });

  it("知らない URL を別の Guide へ送らない", () => {
    expect(guideByPath("/help/login/unknown")).toBeUndefined();
    expect(guideByPath("/help/login/remote-signer/extra")).toBeUndefined();
    expect(guideById("login.unknown")).toBeUndefined();
  });

  it("すべての Guide を手動でカテゴリから辿れる", () => {
    expect(
      new Set(GUIDE_CATEGORIES.map((category) => category.path)).size,
    ).toBe(GUIDE_CATEGORIES.length);
    for (const category of GUIDE_CATEGORIES) {
      expect(guideCategoryByPath(category.path)).toBe(category);
      expect(guidesInCategory(category.id).length).toBeGreaterThan(0);
      for (const guide of guidesInCategory(category.id)) {
        expect(guide.id.startsWith(`${category.id}.`)).toBe(true);
        expect(guide.path.startsWith(`${category.path}/`)).toBe(true);
      }
    }
    expect(guideCategoryByPath("/help/missing")).toBeUndefined();
  });
});
