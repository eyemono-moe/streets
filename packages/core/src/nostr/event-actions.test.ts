import { describe, expect, it } from "vite-plus/test";
import type { NostrEvent } from "./event";
import { canBookmark, canPin, canReply } from "./event-actions";

const of = (kind: number) => ({ kind }) as NostrEvent;

describe("canReply", () => {
  it("kind:42 は返信を差し替えられるときだけ出す", () => {
    expect(canReply(of(42), { custom: false })).toBe(false);
    expect(canReply(of(42), { custom: true })).toBe(true);
  });

  it("kind:42 以外は、差し替えの有無によらず出す", () => {
    expect(canReply(of(1), { custom: false })).toBe(true);
    expect(canReply(of(30023), { custom: false })).toBe(true);
  });
});

describe("canBookmark / canPin", () => {
  it("kind:42 はブックマークにもピン留めにも入れない", () => {
    expect(canBookmark(of(42))).toBe(false);
    expect(canPin(of(42))).toBe(false);
  });

  it("kind:1 は両方入れる", () => {
    expect(canBookmark(of(1))).toBe(true);
    expect(canPin(of(1))).toBe(true);
  });

  it("ブックマークは kind:42 以外を従来どおり入れ、ピン留めは kind:1 だけ", () => {
    expect(canBookmark(of(30023))).toBe(true);
    expect(canPin(of(30023))).toBe(false);
  });
});
