import { describe, expect, it } from "vite-plus/test";
import type { NostrEvent } from "./event";
import { encodeEventPointer, pointsTo } from "./event-pointer";
import { decodeNip19, encodeBech32 } from "./nip19";

const evt = (fields: Partial<NostrEvent>): NostrEvent =>
  ({
    id: "1".repeat(64),
    pubkey: "9".repeat(64),
    created_at: 1_700_000_000,
    kind: 1,
    tags: [],
    content: "",
    sig: "c".repeat(128),
    ...fields,
  }) as NostrEvent;

const article = evt({ kind: 30023, tags: [["d", "slug"]] });

describe("encodeEventPointer", () => {
  it("ふつうの投稿は nevent に作者・種類・リレー 2 本までを入れる", () => {
    const pointer = encodeEventPointer(evt({}), [
      "wss://a.example",
      "wss://b.example",
      "wss://c.example",
    ]);
    expect(decodeNip19(pointer)).toEqual({
      kind: "nevent",
      id: "1".repeat(64),
      author: "9".repeat(64),
      eventKind: 1,
      relays: ["wss://a.example", "wss://b.example"],
    });
  });

  it("住所を持つものは naddr にする", () => {
    // 捕まえる変異: nevent にする —— 記事を書き直すと、古い版を指したままになる
    expect(
      decodeNip19(encodeEventPointer(article, ["wss://a.example"])),
    ).toEqual({
      kind: "naddr",
      identifier: "slug",
      pubkey: "9".repeat(64),
      eventKind: 30023,
      relays: ["wss://a.example"],
    });
  });
});

describe("pointsTo", () => {
  const ref = (value: string) => decodeNip19(value)!;

  it("note と nevent は id で比べる", () => {
    expect(pointsTo(ref(encodeBech32("note", "1".repeat(64))), evt({}))).toBe(
      true,
    );
    expect(pointsTo(ref(encodeEventPointer(evt({}))), evt({}))).toBe(true);
    expect(pointsTo(ref(encodeBech32("note", "2".repeat(64))), evt({}))).toBe(
      false,
    );
  });

  it("住所を持つものは naddr の住所でも比べる", () => {
    expect(pointsTo(ref(encodeEventPointer(article)), article)).toBe(true);
    expect(
      pointsTo(
        ref(encodeEventPointer(evt({ ...article, tags: [["d", "other"]] }))),
        article,
      ),
    ).toBe(false);
  });

  it("人を指す参照は投稿を指さない", () => {
    expect(pointsTo(ref(encodeBech32("npub", "9".repeat(64))), evt({}))).toBe(
      false,
    );
  });
});
