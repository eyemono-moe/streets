import { describe, expect, it } from "vite-plus/test";
import type { NostrEvent } from "../event";
import { buildRepost } from "../repost";

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

describe("buildRepost", () => {
  it("content は対象の JSON", () => {
    // 捕まえる変異: 空文字にする。NIP-18: "MAY also be empty, but that is not recommended" —— 空だと受け手が対象を取りに行くまで何も出せない
    const target = evt({ id: "1".repeat(64), content: "hi" });
    const draft = buildRepost(target);
    expect(JSON.parse(draft?.content ?? "")).toEqual(target);
  });

  it("e タグは NIP-01 の形で、リレー URL を 3 番目、作者を 4 番目に持つ", () => {
    const target = evt({ id: "1".repeat(64), pubkey: "9".repeat(64) });
    const draft = buildRepost(target, { relayHint: "wss://a.example" });
    expect(draft?.tags.filter((t) => t[0] === "e")).toEqual([
      ["e", "1".repeat(64), "wss://a.example", "9".repeat(64)],
    ]);
  });

  it("relayHint が無くても作者を 4 番目からずらさない", () => {
    const target = evt({ id: "1".repeat(64), pubkey: "9".repeat(64) });
    const draft = buildRepost(target);
    expect(draft?.tags.filter((t) => t[0] === "e")).toEqual([
      ["e", "1".repeat(64), "", "9".repeat(64)],
    ]);
  });

  it("NIP-70 で保護された投稿は埋め込まない", () => {
    const draft = buildRepost(evt({ tags: [["-"]], content: "hi" }));
    expect(draft?.content).toBe("");
  });

  it("元の著者に p タグを立てる", () => {
    // 捕まえる変異: p を落とす
    const target = evt({ pubkey: "9".repeat(64) });
    expect(buildRepost(target)?.tags).toContainEqual(["p", "9".repeat(64)]);
  });

  it("kind は 6", () => {
    expect(buildRepost(evt({}))?.kind).toBe(6);
  });

  it("kind:1 以外は undefined", () => {
    // 捕まえる変異: kind を見ずに常に kind:6 を作る —— kind:6 に kind:1 以外を入れるのは NIP-18 違反 (そちらは kind:16)
    expect(buildRepost(evt({ kind: 30023 }))).toBeUndefined();
  });
});
