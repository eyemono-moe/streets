import { describe, expect, it } from "vitest";
import type { NostrEvent } from "../event";
import { buildDeletion } from "./deletion";

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

describe("buildDeletion", () => {
  it("e と k を持つ kind:5", () => {
    // 捕まえる変異: k を落とす。NIP-09 は SHOULD と言うが、無いとリレーが
    // 置換可能イベントの削除を正しく扱えない実装がある。
    const target = evt({ id: "1".repeat(64), kind: 1 });
    const draft = buildDeletion(target);
    expect(draft.kind).toBe(5);
    expect(draft.tags).toEqual([
      ["e", "1".repeat(64)],
      ["k", "1"],
    ]);
    expect(draft.content).toBe("");
  });

  it("k タグが target.kind から導出される (kind 30023 で検証)", () => {
    // 捕まえる変異: k タグを String(target.kind) ではなく硬コードされた
    // "1" に置き換える。fixture の kind デフォルトが 1 なので、全テストが
    // 同じ値でしかテストできない。この例外テストで検証。
    const target = evt({ id: "1".repeat(64), kind: 30023 });
    const draft = buildDeletion(target);
    expect(draft.tags).toEqual([
      ["e", "1".repeat(64)],
      ["k", "30023"],
    ]);
  });

  it("理由を content に載せる", () => {
    // 捕まえる変異: reason を捨てる
    expect(buildDeletion(evt({}), "誤爆").content).toBe("誤爆");
  });
});
