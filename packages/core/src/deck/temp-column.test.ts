import { describe, expect, it } from "vite-plus/test";
import { encodeBech32, encodeNevent } from "../nostr/nip19";
import { TEMP_COLUMN_ID, tempColumnFor } from "./temp-column";

const PUBKEY = "a".repeat(64);
const EVENT_ID = "b".repeat(64);

describe("tempColumnFor", () => {
  it("npub はその人のカラムになる", () => {
    const column = tempColumnFor(encodeBech32("npub", PUBKEY));
    expect(column?.source).toEqual({ kind: "user", pubkey: PUBKEY });
    expect(column?.id).toBe(TEMP_COLUMN_ID);
  });

  it("note はそのイベント 1 件を引くカラムになる", () => {
    // 捕まえる変異: ids ではなく authors で引く（本人の全投稿が出てしまう）
    expect(tempColumnFor(encodeBech32("note", EVENT_ID))?.source).toEqual({
      kind: "literal",
      filters: [{ ids: [EVENT_ID] }],
    });
  });

  it("読めない文字列では作らない", () => {
    // 捕まえる変異: 例外を握って空のカラムを返す
    expect(tempColumnFor("nostr")).toBeUndefined();
    expect(tempColumnFor("")).toBeUndefined();
  });
});

describe("tempColumnFor（チャンネル）", () => {
  it("kind:40 を指す nevent は、そのチャンネルのカラムになる", () => {
    const nevent = encodeNevent({
      id: EVENT_ID,
      relays: ["wss://yabu.me/"],
      eventKind: 40,
    });
    // 捕まえる変異: 種類を見ずに、チャンネルそのもの 1 件を出すカラムにする
    expect(nevent && tempColumnFor(nevent)?.source).toEqual({
      kind: "channel",
      id: EVENT_ID,
      relays: ["wss://yabu.me/"],
    });
  });
});
