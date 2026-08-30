import { describe, expect, it } from "vitest";
import type { NostrEvent } from "../event";
import { parseReaction } from "../reaction";
import { buildReaction } from "./reaction";

const evt = (fields: Partial<NostrEvent>): NostrEvent =>
  ({
    id: "a".repeat(64),
    pubkey: "b".repeat(64),
    created_at: 1_700_000_000,
    kind: 1,
    tags: [],
    content: "",
    sig: "c".repeat(128),
    ...fields,
  }) as NostrEvent;

describe("buildReaction", () => {
  it("like は content が + で、e/p/k を持つ", () => {
    // 捕まえる変異: k タグを落とす。読み取り側の parseReaction が
    // 既に見ているので、落とすと自分が書いたものを自分で読めなくなる。
    const target = evt({ id: "1".repeat(64), pubkey: "9".repeat(64), kind: 1 });
    const draft = buildReaction(target, { type: "like" });
    expect(draft.kind).toBe(7);
    expect(draft.content).toBe("+");
    expect(draft.tags).toEqual([
      ["e", "1".repeat(64)],
      ["p", "9".repeat(64)],
      ["k", "1"],
    ]);
  });

  it("k タグが target.kind から導出される (kind 30023 で検証)", () => {
    // 捕まえる変異: k タグを String(target.kind) ではなく硬コードされた
    // "1" に置き換える。fixture の kind デフォルトが 1 なので、全テストが
    // 同じ値でしかテストできない。この例外テストで検証。
    const target = evt({
      id: "1".repeat(64),
      pubkey: "9".repeat(64),
      kind: 30023,
    });
    const draft = buildReaction(target, { type: "like" });
    expect(draft.tags).toEqual([
      ["e", "1".repeat(64)],
      ["p", "9".repeat(64)],
      ["k", "30023"],
    ]);
  });

  it("カスタム絵文字は emoji タグ 1 つと :shortcode: 1 つ", () => {
    // 捕まえる変異: content に飾りを足す (":x: すごい" など)。NIP-25 は
    // "The content can be set only one :shortcode:" と定めており、
    // 足すと他クライアントが素のテキストとして描く。
    const target = evt({ id: "1".repeat(64), pubkey: "9".repeat(64) });
    const draft = buildReaction(target, {
      type: "emoji",
      shortcode: "streetsparrot",
      url: "https://example.invalid/p.png",
    });
    expect(draft.content).toBe(":streetsparrot:");
    expect(draft.tags.filter((t) => t[0] === "emoji")).toEqual([
      ["emoji", "streetsparrot", "https://example.invalid/p.png"],
    ]);
  });

  it("text はそのまま content に載り、emoji タグを持たない", () => {
    // 捕まえる変異: text にも emoji タグを付ける
    const draft = buildReaction(evt({}), { type: "text", content: "🎉" });
    expect(draft.content).toBe("🎉");
    expect(draft.tags.filter((t) => t[0] === "emoji")).toEqual([]);
  });

  it("往復: buildReaction で作ったものを parseReaction が読み戻せる", () => {
    // 捕まえる変異: どちらか一方だけを NIP に沿わせる。書いたものを自分で
    // 読めないのは、同じ NIP を 2 箇所で別々に解釈している証拠。
    const target = evt({ id: "1".repeat(64), pubkey: "9".repeat(64) });
    for (const input of [
      { type: "like" } as const,
      { type: "text", content: "🎉" } as const,
      {
        type: "emoji",
        shortcode: "streetsparrot",
        url: "https://example.invalid/p.png",
      } as const,
    ]) {
      const draft = buildReaction(target, input);
      const parsed = parseReaction({
        ...draft,
        id: "f".repeat(64),
        pubkey: "e".repeat(64),
        created_at: 1_700_000_000,
        sig: "d".repeat(128),
      } as NostrEvent);
      expect(parsed?.targetId).toBe(target.id);
      if (input.type === "like") expect(parsed?.content.type).toBe("like");
      if (input.type === "text") expect(parsed?.content.type).toBe("text");
      if (input.type === "emoji") expect(parsed?.content.type).toBe("emoji");
    }
  });
});
