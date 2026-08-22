import { describe, expect, it } from "vitest";
import type { NostrEvent } from "../event";
import { mergeProfile } from "./profile";

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

describe("mergeProfile", () => {
  it("current に有って changes に無いキーを残す", () => {
    // 捕まえる変異: changes だけで content を作り直す。他クライアントが
    // 入れた lud16 (Zap の宛先) などが黙って消える。
    const current = evt({
      kind: 0,
      tags: [],
      content: JSON.stringify({ name: "a", lud16: "a@b.example" }),
    });
    const draft = mergeProfile({ name: "b" })(current);
    expect(JSON.parse(draft.content)).toEqual({
      name: "b",
      lud16: "a@b.example",
    });
  });

  it("current の content が壊れていれば changes だけにする", () => {
    // 捕まえる変異: 例外を投げる。壊れた JSON でプロフィールが
    // 永久に編集できなくなる。
    const current = evt({ kind: 0, tags: [], content: "not json" });
    const draft = mergeProfile({ name: "b" })(current);
    expect(JSON.parse(draft.content)).toEqual({ name: "b" });
  });

  it("current が無ければ changes だけ", () => {
    // 捕まえる変異: current 無しで例外を投げる
    expect(JSON.parse(mergeProfile({ name: "b" })(undefined).content)).toEqual({
      name: "b",
    });
  });

  it("タグを保つ", () => {
    // 捕まえる変異: tags を空にする
    const current = evt({ kind: 0, tags: [["alt", "profile"]], content: "{}" });
    expect(mergeProfile({ name: "b" })(current).tags).toEqual([
      ["alt", "profile"],
    ]);
  });
});
