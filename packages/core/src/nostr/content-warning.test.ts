import { describe, expect, it } from "vite-plus/test";
import { contentWarning } from "./content-warning";
import type { NostrEvent } from "./event";

const note = (tags: string[][]): NostrEvent => ({
  id: "a".repeat(64),
  pubkey: "b".repeat(64),
  created_at: 1,
  kind: 1,
  tags,
  content: "",
  sig: "",
});

describe("contentWarning", () => {
  it("理由を読む", () => {
    expect(contentWarning(note([["content-warning", " nsfw "]]))).toEqual({
      reason: "nsfw",
    });
  });

  it("理由が無い・空でも注意書きとみなす", () => {
    expect(contentWarning(note([["content-warning"]]))).toEqual({});
    expect(contentWarning(note([["content-warning", ""]]))).toEqual({});
  });

  it("タグが無ければ注意書きではない（NIP-32 のラベルだけでも）", () => {
    expect(contentWarning(note([["t", "nostr"]]))).toBeUndefined();
    expect(
      contentWarning(
        note([
          ["L", "content-warning"],
          ["l", "nudity", "content-warning"],
        ]),
      ),
    ).toBeUndefined();
  });
});
