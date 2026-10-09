import { describe, expect, it } from "vite-plus/test";
import type { NostrEvent } from "../nostr/event";
import { quotePreview } from "./quote-preview";

const event = (kind: number, content: string, tags: string[][] = []) =>
  ({
    id: "a".repeat(64),
    pubkey: "b".repeat(64),
    created_at: 0,
    kind,
    tags,
    content,
    sig: "",
  }) satisfies NostrEvent;

describe("quotePreview", () => {
  it("文章の kind は、改行を詰め nostr: の参照を除いた本文を返す", () => {
    // 捕まえる変異: 改行や参照をそのまま残して 1 行に長い bech32 が混ざる
    expect(
      quotePreview(event(1, "一行目\n\n二行目 nostr:nevent1abc 末尾")),
    ).toBe("一行目 二行目 末尾");
  });

  it("文章でない kind は本文ではなく alt を返す", () => {
    // 捕まえる変異: JSON の本文をそのまま出す
    expect(
      quotePreview(event(0, '{"name":"a"}', [["alt", "プロフィール"]])),
    ).toBe("プロフィール");
  });

  it("文章でなく alt も無ければ空", () => {
    expect(quotePreview(event(30_023, "# 記事"))).toBe("");
  });
});
