import { describe, expect, it } from "vitest";
import type { RelayListEntry } from "../../read/relay-list";
import { parseRelayList } from "../../read/relay-list";
import type { RelayUrl } from "../../relay/relay-connection";
import type { NostrEvent } from "../event";
import { setRelayList } from "./relay-list";

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

describe("setRelayList", () => {
  it("read と write の両方ならマーカーを付けない", () => {
    // 捕まえる変異: 常に 2 本の r タグを出す —— NIP-65 はマーカー無しを「両方」と定め、冗長なだけでなく他クライアントの表示で 2 本に見える
    const draft = setRelayList([
      { url: "wss://a.example" as RelayUrl, read: true, write: true },
    ])(undefined);
    expect(draft.tags).toEqual([["r", "wss://a.example"]]);
  });

  it("片方だけならマーカーを付ける", () => {
    // 捕まえる変異: read/write を取り違える
    const draft = setRelayList([
      { url: "wss://a.example" as RelayUrl, read: true, write: false },
      { url: "wss://b.example" as RelayUrl, read: false, write: true },
    ])(undefined);
    expect(draft.tags).toEqual([
      ["r", "wss://a.example", "read"],
      ["r", "wss://b.example", "write"],
    ]);
  });

  it("read も write も false のエントリは落とす", () => {
    // 捕まえる変異: マーカー無しで出す (= 両方の意味になる)
    const draft = setRelayList([
      { url: "wss://a.example" as RelayUrl, read: false, write: false },
    ])(undefined);
    expect(draft.tags).toEqual([]);
  });

  it("往復: setRelayList で作ったものを parseRelayList が読み戻せる", () => {
    // 捕まえる変異: どちらか一方だけを NIP に沿わせる
    // URL は正規化済み (末尾スラッシュ付き) で書く —— parseRelayList は normalizeRelayUrl を通すため、"wss://a.example" だと "wss://a.example/" に変わり往復比較が失敗する
    const entries: RelayListEntry[] = [
      { url: "wss://a.example/" as RelayUrl, read: true, write: true },
      { url: "wss://b.example/" as RelayUrl, read: true, write: false },
      { url: "wss://c.example/" as RelayUrl, read: false, write: true },
    ];
    const draft = setRelayList(entries)(undefined);
    const parsed = parseRelayList({
      ...draft,
      id: "f".repeat(64),
      pubkey: "e".repeat(64),
      created_at: 1_700_000_000,
      sig: "d".repeat(128),
    } as NostrEvent);
    expect(parsed).toEqual(entries);
  });

  it("既存の r タグは残さず新しい内容で置き換える", () => {
    // 捕まえる変異: replaceTags へ渡すタグ名を "r" から空文字にする —— フィルタ対象がずれると、置き換え前の r タグが素通りして重複してしまう
    const current = evt({
      kind: 10002,
      tags: [["r", "wss://old.example"]],
      content: "",
    });
    const draft = setRelayList([
      { url: "wss://new.example" as RelayUrl, read: true, write: true },
    ])(current);
    expect(draft.tags).toEqual([["r", "wss://new.example"]]);
  });

  it("r 以外のタグと content を保つ", () => {
    // 捕まえる変異: tags を r だけで作り直す
    const current = evt({
      kind: 10002,
      tags: [["alt", "relays"]],
      content: "x",
    });
    const draft = setRelayList([])(current);
    expect(draft.tags).toEqual([["alt", "relays"]]);
    expect(draft.content).toBe("x");
  });
});
