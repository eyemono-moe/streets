import { describe, expect, it } from "vite-plus/test";
import { STREETS_CLIENT_TAG, withClientTag } from "./client-tag";

describe("withClientTag", () => {
  it("投稿の末尾に Streets の kind:31990 を指すタグを足す", () => {
    const draft = withClientTag({
      kind: 1,
      tags: [["t", "nostr"]],
      content: "",
    });
    expect(draft.tags).toEqual([["t", "nostr"], [...STREETS_CLIENT_TAG]]);
    expect(STREETS_CLIENT_TAG[2]).toMatch(/^31990:[0-9a-f]{64}:streets$/);
  });

  it("チャンネルでの発言にも足す", () => {
    expect(withClientTag({ kind: 42, tags: [], content: "" }).tags).toEqual([
      [...STREETS_CLIENT_TAG],
    ]);
  });

  it("リアクションやリポストには足さない", () => {
    for (const kind of [6, 7, 16]) {
      const draft = { kind, tags: [], content: "" };
      expect(withClientTag(draft)).toBe(draft);
    }
  });

  it("もう付いていれば重ねない", () => {
    const draft = { kind: 1, tags: [["client", "Other"]], content: "" };
    expect(withClientTag(draft)).toBe(draft);
  });
});
