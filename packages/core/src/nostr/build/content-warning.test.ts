import { describe, expect, it } from "vite-plus/test";
import { withContentWarning } from "./content-warning";
import { buildNote } from "./note";

describe("withContentWarning", () => {
  it("理由を添えて付ける", () => {
    expect(withContentWarning(buildNote("本文"), "ネタバレ").tags).toEqual([
      ["content-warning", "ネタバレ"],
    ]);
  });

  it("理由が空なら値の無いタグにする", () => {
    expect(withContentWarning(buildNote("本文"), "").tags).toEqual([
      ["content-warning"],
    ]);
  });

  it("undefined なら付けない", () => {
    const draft = buildNote("#nostr");
    expect(withContentWarning(draft, undefined)).toBe(draft);
  });
});
