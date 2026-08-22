import { describe, expect, it } from "vitest";
import type { NostrEvent } from "../event";
import { addMute, removeMute } from "./mute";

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

describe("addMute", () => {
  it("種別ごとに正しいタグ名を使う", () => {
    // 捕まえる変異: 全部 p タグにする。ハッシュタグや単語のミュートが
    // 「その pubkey をミュート」として他クライアントに読まれる。
    expect(addMute({ type: "pubkey", value: "aa" })(undefined).tags).toEqual([
      ["p", "aa"],
    ]);
    expect(
      addMute({ type: "hashtag", value: "nostr" })(undefined).tags,
    ).toEqual([["t", "nostr"]]);
    expect(addMute({ type: "thread", value: "bb" })(undefined).tags).toEqual([
      ["e", "bb"],
    ]);
  });

  it("word は小文字化する", () => {
    // 捕まえる変異: そのまま入れる。NIP-51 は "lowercase strings" と定めており、
    // 大文字のまま入れると読む側の突き合わせが一致しない。
    expect(addMute({ type: "word", value: "Nostr" })(undefined).tags).toEqual([
      ["word", "nostr"],
    ]);
  });

  it("kind は 10000", () => {
    expect(addMute({ type: "pubkey", value: "aa" })(undefined).kind).toBe(
      10000,
    );
  });

  it("同じ種別の他のタグと content を保つ", () => {
    // 捕まえる変異: p を差し替えるときに t まで消す
    const current = evt({
      kind: 10000,
      tags: [
        ["p", "aa"],
        ["t", "spam"],
      ],
      content: "encrypted-blob",
    });
    const draft = addMute({ type: "pubkey", value: "bb" })(current);
    expect(draft.tags).toContainEqual(["t", "spam"]);
    expect(draft.tags).toContainEqual(["p", "aa"]);
    expect(draft.tags).toContainEqual(["p", "bb"]);
    expect(draft.content).toBe("encrypted-blob");
  });

  it("重複させない", () => {
    // 捕まえる変異: 無条件に push する
    const current = evt({ kind: 10000, tags: [["p", "aa"]], content: "" });
    expect(
      addMute({ type: "pubkey", value: "aa" })(current).tags.filter(
        (t) => t[0] === "p",
      ),
    ).toEqual([["p", "aa"]]);
  });
});

describe("removeMute", () => {
  it("該当するタグだけを落とす", () => {
    // 捕まえる変異: 同じ値の別種別まで落とす
    const current = evt({
      kind: 10000,
      tags: [
        ["p", "aa"],
        ["t", "aa"],
      ],
      content: "",
    });
    expect(removeMute({ type: "pubkey", value: "aa" })(current).tags).toEqual([
      ["t", "aa"],
    ]);
  });
});
