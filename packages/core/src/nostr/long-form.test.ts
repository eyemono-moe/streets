import { describe, expect, it } from "vite-plus/test";
import type { NostrEvent } from "./event";
import { articleExcerpt, parseArticle } from "./long-form";

const article = (tags: string[][]): NostrEvent => ({
  id: "0".repeat(64),
  pubkey: "a".repeat(64),
  created_at: 2000,
  kind: 30_023,
  tags,
  content: "# 見出し",
  sig: "0".repeat(128),
});

describe("parseArticle", () => {
  it("題名・要約・画像・公開日・ハッシュタグを読む", () => {
    expect(
      parseArticle(
        article([
          ["d", "post"],
          ["title", " 題名 "],
          ["summary", "要約"],
          ["image", "https://example.com/a.png"],
          ["published_at", "1000"],
          ["t", "Nostr"],
          ["t", "nostr"],
        ]),
      ),
    ).toEqual({
      pubkey: "a".repeat(64),
      identifier: "post",
      title: "題名",
      summary: "要約",
      image: "https://example.com/a.png",
      publishedAt: 1000,
      updatedAt: 2000,
      hashtags: ["nostr"],
      content: "# 見出し",
    });
  });

  it("http(s) でない画像と、数でない公開日は読まない", () => {
    // 捕まえる変異: javascript: の URL を img の src に渡す
    const parsed = parseArticle(
      article([
        ["image", "javascript:alert(1)"],
        ["published_at", "昨日"],
      ]),
    );
    expect(parsed?.image).toBeUndefined();
    expect(parsed?.publishedAt).toBeUndefined();
  });

  it("長文でない kind は読まない", () => {
    expect(parseArticle({ ...article([]), kind: 1 })).toBeUndefined();
  });
});

describe("articleExcerpt", () => {
  it("要約が無ければ、本文から記号を落として切り出す", () => {
    const parsed = parseArticle({
      ...article([]),
      content:
        "# 見出し\n\n**太字**と[リンク](https://example.com)。\n\n```\ncode\n```\n" +
        "あ".repeat(200),
    });
    if (!parsed) throw new Error("article");
    const excerpt = articleExcerpt(parsed);
    expect(excerpt?.startsWith("見出し 太字とリンク。")).toBe(true);
    expect(excerpt?.endsWith("…")).toBe(true);
    expect(excerpt).not.toContain("code");
  });
});
