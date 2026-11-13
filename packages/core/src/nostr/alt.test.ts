import { describe, expect, it } from "vite-plus/test";
import { altText } from "./alt";
import type { NostrEvent } from "./event";

const eventWith = (tags: string[][]): NostrEvent => ({
  id: "a".repeat(64),
  pubkey: "b".repeat(64),
  created_at: 0,
  kind: 9802,
  tags,
  content: "",
  sig: "c".repeat(128),
});

describe("altText", () => {
  // NIP-31: "clients should use an `alt` tag to write a short human-readable plaintext
  // summary of what that event is about."
  it("alt タグの文を返す", () => {
    expect(altText(eventWith([["alt", "A highlight from an article"]]))).toBe(
      "A highlight from an article",
    );
  });

  it("alt タグが無ければ undefined", () => {
    expect(altText(eventWith([["t", "nostr"]]))).toBeUndefined();
  });

  it("空の alt は飛ばし、次の alt を読む", () => {
    // 捕まえる変異: 最初の alt で止まる —— 空の説明を出しても、何のイベントか分からない
    expect(
      altText(
        eventWith([
          ["alt", "  "],
          ["alt", "Calendar event"],
        ]),
      ),
    ).toBe("Calendar event");
  });
});
