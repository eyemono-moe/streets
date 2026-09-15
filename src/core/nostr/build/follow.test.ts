import { describe, expect, it } from "vitest";
import type { NostrEvent } from "../event";
import { addFollow, removeFollow } from "./follow";

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

describe("addFollow", () => {
  it("末尾に追加し、既存の p の順序を保つ", () => {
    // 捕まえる変異: 新しい配列をソートして作り直す。NIP-02: "clients should append them to maintain chronological order" —— 並べ替えると全クライアントのフォロー順が壊れる
    const current = evt({
      kind: 3,
      tags: [
        ["p", "aa"],
        ["p", "bb"],
      ],
      content: "",
    });
    const draft = addFollow("cc")(current);
    expect(draft.tags.filter((t) => t[0] === "p")).toEqual([
      ["p", "aa"],
      ["p", "bb"],
      ["p", "cc", "", ""],
    ]);
  });

  it("対象外のタグと content を保つ", () => {
    // 捕まえる変異: tags を p だけで作り直し content を空にする —— 他クライアントがリレーリストの JSON を content に入れており、消すとその端末の設定が飛ぶ
    const current = evt({
      kind: 3,
      tags: [
        ["p", "aa"],
        ["t", "nostr"],
      ],
      content: '{"wss://a.example":{"read":true,"write":true}}',
    });
    const draft = addFollow("cc")(current);
    expect(draft.tags).toContainEqual(["t", "nostr"]);
    expect(draft.content).toBe(current.content);
  });

  it("既に居る pubkey は重複させない", () => {
    // 捕まえる変異: 無条件に push する
    const current = evt({ kind: 3, tags: [["p", "aa"]], content: "" });
    const draft = addFollow("aa")(current);
    expect(draft.tags.filter((t) => t[0] === "p")).toEqual([["p", "aa"]]);
  });

  it("current が無ければ 1 件だけのリストを作る", () => {
    // 捕まえる変異: current 無しで例外を投げる —— 初めてフォローするときに永久に書けなくなる
    const draft = addFollow("cc")(undefined);
    expect(draft.kind).toBe(3);
    expect(draft.tags).toEqual([["p", "cc", "", ""]]);
    expect(draft.content).toBe("");
  });

  it("relay と petname を位置要素に載せる", () => {
    // 捕まえる変異: petname を relay の位置に入れる
    const draft = addFollow("cc", {
      relay: "wss://a.example",
      petname: "あいもの",
    })(undefined);
    expect(draft.tags).toEqual([["p", "cc", "wss://a.example", "あいもの"]]);
  });
});

describe("removeFollow", () => {
  it("該当する p だけを落とす", () => {
    // 捕まえる変異: 最初の p を落とす / 全部落とす
    const current = evt({
      kind: 3,
      tags: [
        ["p", "aa"],
        ["p", "bb"],
        ["t", "nostr"],
      ],
      content: "x",
    });
    const draft = removeFollow("aa")(current);
    expect(draft.tags).toEqual([
      ["p", "bb"],
      ["t", "nostr"],
    ]);
    expect(draft.content).toBe("x");
  });

  it("居ない pubkey を消しても失敗しない", () => {
    // 捕まえる変異: 見つからなければ投げる
    const current = evt({ kind: 3, tags: [["p", "aa"]], content: "" });
    expect(removeFollow("zz")(current).tags).toEqual([["p", "aa"]]);
  });

  it("current が無ければ空のリスト", () => {
    // 捕まえる変異: current 無しで例外を投げる
    expect(removeFollow("zz")(undefined).tags).toEqual([]);
  });
});
