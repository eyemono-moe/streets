import { describe, expect, it } from "vite-plus/test";
import type { NostrEvent } from "../nostr/event";
import { commentScope, replyParentRef, replyPubkey } from "./comment-scope";

const ROOT = "1".repeat(64);
const PK = "8".repeat(64);
const ARTICLE = `30023:${PK}:post`;

const comment = (tags: string[][], kind = 1111): NostrEvent => ({
  id: "a".repeat(64),
  pubkey: "b".repeat(64),
  created_at: 0,
  kind,
  tags,
  content: "",
  sig: "",
});

describe("commentScope", () => {
  it("根が投稿なら返信と同じに見せるので何も返さない", () => {
    // 捕まえる変異: kind:1 の根にも「〜へのコメント」を出す（Amethyst の返信だけ見た目が変わる）
    expect(
      commentScope(
        comment([
          ["E", ROOT, "", PK],
          ["K", "1"],
          ["e", ROOT, "", PK],
          ["k", "1"],
        ]),
      ),
    ).toBeUndefined();
  });

  it("記事へのコメントは、記事を住所で指す", () => {
    expect(
      commentScope(
        comment([
          ["A", ARTICLE, "wss://r.example/"],
          ["K", "30023"],
        ]),
      ),
    ).toEqual({
      type: "event",
      label: "長文記事へのコメント",
      target: { form: "address", address: ARTICLE, relay: "wss://r.example/" },
    });
  });

  it("K が無くても、住所から記事だと分かる", () => {
    // 捕まえる変異: K だけで kind を決める（K を落とすクライアントのコメントが「コメント」とだけ出る）
    expect(commentScope(comment([["A", ARTICLE]]))?.label).toBe(
      "長文記事へのコメント",
    );
  });

  it("知らない kind の根は「コメント」とだけ言う", () => {
    // 捕まえる変異: kind の番号をそのまま見せる
    expect(
      commentScope(
        comment([
          ["E", ROOT],
          ["K", "34236"],
        ]),
      )?.label,
    ).toBe("コメント");
  });

  it("Web ページへのコメントは URL を開けるようにする", () => {
    expect(
      commentScope(
        comment([
          ["I", "https://example.com/a"],
          ["K", "web"],
        ]),
      ),
    ).toEqual({
      type: "external",
      label: "Web ページへのコメント",
      value: "https://example.com/a",
      url: "https://example.com/a",
    });
  });

  it("http でない値はリンクにしない", () => {
    // 捕まえる変異: K=web なら値をそのまま href にする（javascript: などを踏ませる）
    expect(
      commentScope(
        comment([
          ["I", "javascript:alert(1)"],
          ["K", "web"],
        ]),
      ),
    ).not.toHaveProperty("url");
  });

  it("コメントでなければ何も返さない", () => {
    expect(commentScope(comment([["A", ARTICLE]], 1))).toBeUndefined();
  });
});

describe("返信先", () => {
  it("記事へのコメントは、住所の書き手と住所を返す", () => {
    // 捕まえる変異: replyTarget だけを見る（記事へのコメントに返信先が出ない）
    const event = comment([
      ["A", ARTICLE],
      ["a", ARTICLE, "wss://r.example/"],
      ["k", "30023"],
    ]);
    expect(replyPubkey(event)).toBe(PK);
    expect(replyParentRef(event)).toEqual({
      form: "address",
      address: ARTICLE,
      relay: "wss://r.example/",
    });
  });

  it("id を指す親は、そのまま返す", () => {
    const event = comment([
      ["e", ROOT, "", PK],
      ["k", "1"],
    ]);
    expect(replyPubkey(event)).toBe(PK);
    expect(replyParentRef(event)).toEqual({ form: "id", id: ROOT, pubkey: PK });
  });

  it("外部の識別子への親は引けない", () => {
    expect(
      replyParentRef(
        comment([
          ["i", "https://example.com/a"],
          ["k", "web"],
        ]),
      ),
    ).toBeUndefined();
  });
});
