import { describe, expect, it } from "vite-plus/test";
import { GUIDES, guideById, guideByPath } from "./guides";

describe("Signal Guide", () => {
  it("ID と公開 URL が一意で、双方から同じ Guide を引ける", () => {
    expect(new Set(GUIDES.map((guide) => guide.id)).size).toBe(GUIDES.length);
    expect(new Set(GUIDES.map((guide) => guide.path)).size).toBe(GUIDES.length);
    for (const guide of GUIDES) {
      expect(guideById(guide.id)).toBe(guide);
      expect(guideByPath(guide.path)).toBe(guide);
      expect(guide.content.length).toBeGreaterThan(0);
    }
  });

  it("知らない URL を別の Guide へ送らない", () => {
    expect(guideByPath("/help/login/unknown")).toBeUndefined();
    expect(guideByPath("/help/login/remote-signer/extra")).toBeUndefined();
    expect(guideById("login.unknown")).toBeUndefined();
  });
});
