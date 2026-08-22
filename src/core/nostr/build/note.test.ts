import { describe, expect, it } from "vitest";
import type { NostrEvent } from "../event";
import { buildReply } from "./note";

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

describe("buildReply", () => {
  it("根への返信は root マーカー 1 本だけ", () => {
    // 捕まえる変異: reply マーカーも足す。NIP-10 は
    // "should have a single marked 'e' tag of type 'root'" と定めている。
    const parent = evt({ id: "1".repeat(64), pubkey: "9".repeat(64) });
    const draft = buildReply(parent, "hi", { relayHint: "wss://a.example" });
    const e = draft.tags.filter((t) => t[0] === "e");
    expect(e).toEqual([
      ["e", "1".repeat(64), "wss://a.example", "root", "9".repeat(64)],
    ]);
  });

  it("返信への返信は親の root を引き継ぎ、root と reply の 2 本を持つ", () => {
    // 捕まえる変異: 親だけを指して root を引き継がない。スレッドの根が
    // 失われ、他クライアントで会話が分断される。
    const parent = evt({
      id: "2".repeat(64),
      pubkey: "9".repeat(64),
      tags: [["e", "1".repeat(64), "wss://r.example", "root", "8".repeat(64)]],
    });
    const draft = buildReply(parent, "hi", { relayHint: "wss://a.example" });
    expect(draft.tags.filter((t) => t[0] === "e")).toEqual([
      ["e", "1".repeat(64), "wss://r.example", "root", "8".repeat(64)],
      ["e", "2".repeat(64), "wss://a.example", "reply", "9".repeat(64)],
    ]);
  });

  it("p は親の著者を先頭に、親の p を出現順で続ける", () => {
    // 捕まえる変異: 親の p を引き継がない。会話の参加者に通知が行かなくなる。
    const parent = evt({
      pubkey: "9".repeat(64),
      tags: [
        ["p", "7".repeat(64)],
        ["p", "6".repeat(64)],
      ],
    });
    const draft = buildReply(parent, "hi");
    expect(draft.tags.filter((t) => t[0] === "p")).toEqual([
      ["p", "9".repeat(64)],
      ["p", "7".repeat(64)],
      ["p", "6".repeat(64)],
    ]);
  });

  it("p の重複を落とす", () => {
    // 捕まえる変異: 無条件に concat する
    const parent = evt({
      pubkey: "9".repeat(64),
      tags: [
        ["p", "9".repeat(64)],
        ["p", "7".repeat(64)],
      ],
    });
    const draft = buildReply(parent, "hi");
    expect(draft.tags.filter((t) => t[0] === "p")).toEqual([
      ["p", "9".repeat(64)],
      ["p", "7".repeat(64)],
    ]);
  });

  it("relayHint が無ければ位置要素を空文字で埋める", () => {
    // 捕まえる変異: 3 番目を省略して ["e", id, "root", pubkey] にする。
    // マーカーが relay-url の位置に来て、読む側が「root」というリレーへ
    // 接続しようとする。
    const parent = evt({ id: "1".repeat(64), pubkey: "9".repeat(64) });
    const draft = buildReply(parent, "hi");
    expect(draft.tags.filter((t) => t[0] === "e")).toEqual([
      ["e", "1".repeat(64), "", "root", "9".repeat(64)],
    ]);
  });

  it("kind と content をそのまま載せる", () => {
    const draft = buildReply(evt({}), "本文");
    expect(draft.kind).toBe(1);
    expect(draft.content).toBe("本文");
  });
});
