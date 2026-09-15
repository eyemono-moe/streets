import { describe, expect, it } from "vitest";
import type { NostrEvent } from "../event";
import { addBookmark, removeBookmark } from "./bookmark";

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

describe("addBookmark / removeBookmark", () => {
  it("note は e、article は a", () => {
    // 捕まえる変異: 両方 e にする
    expect(addBookmark({ type: "note", value: "aa" })(undefined).tags).toEqual([
      ["e", "aa"],
    ]);
    expect(
      addBookmark({ type: "article", value: "30023:pk:d" })(undefined).tags,
    ).toEqual([["a", "30023:pk:d"]]);
  });

  it("kind は 10003", () => {
    expect(addBookmark({ type: "note", value: "aa" })(undefined).kind).toBe(
      10003,
    );
  });

  it("対象外のタグと content を保つ", () => {
    // 捕まえる変異: tags を e/a だけで作り直し content を空にする。未知のタグや暗号化済み content を消すと設定が飛ぶ
    const current = evt({
      kind: 10003,
      tags: [
        ["e", "aa"],
        ["t", "spam"],
      ],
      content: "encrypted-blob",
    });
    const draft = addBookmark({ type: "note", value: "bb" })(current);
    expect(draft.tags).toContainEqual(["t", "spam"]);
    expect(draft.content).toBe("encrypted-blob");
  });

  it("重複させない", () => {
    // 捕まえる変異: 無条件に push する
    const current = evt({ kind: 10003, tags: [["e", "aa"]], content: "" });
    expect(
      addBookmark({ type: "note", value: "aa" })(current).tags.filter(
        (t) => t[0] === "e",
      ),
    ).toEqual([["e", "aa"]]);
  });

  it("削除は該当するタグだけを落とす", () => {
    const current = evt({
      kind: 10003,
      tags: [
        ["e", "aa"],
        ["e", "bb"],
      ],
      content: "",
    });
    expect(removeBookmark({ type: "note", value: "aa" })(current).tags).toEqual(
      [["e", "bb"]],
    );
  });

  it("note と article は別のタグ名を落とす", () => {
    // 捕まえる変異: type を無視して同じタグ名を触る
    const current = evt({
      kind: 10003,
      tags: [
        ["e", "aa"],
        ["a", "aa"],
      ],
      content: "",
    });
    expect(removeBookmark({ type: "note", value: "aa" })(current).tags).toEqual(
      [["a", "aa"]],
    );
  });
});
