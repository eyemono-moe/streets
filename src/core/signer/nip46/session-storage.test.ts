import { describe, expect, it } from "vitest";
import { loadNip46Session, saveNip46Session } from "./session-storage";

const session = {
  version: 2 as const,
  clientSecret: "1".repeat(64),
  remoteSignerPubkey: "2".repeat(64),
  userPubkey: "3".repeat(64),
  relays: ["wss://relay.example/"],
};

describe("NIP-46 session storage", () => {
  it("保存形式をround tripする", () => {
    expect(loadNip46Session(saveNip46Session(session))).toEqual(session);
  });

  it.each([
    "not json",
    // 捕まえる変異: 権限追加前の v1 セッションをそのまま復元する。
    JSON.stringify({ ...session, version: 1 }),
    JSON.stringify({ ...session, clientSecret: "secret" }),
    JSON.stringify({ ...session, relays: [] }),
    JSON.stringify({ ...session, relays: ["https://relay.example"] }),
    JSON.stringify({
      ...session,
      relays: ["wss://relay.example", "wss://relay.example/"],
    }),
    JSON.stringify({ ...session, bunkerSecret: "must not survive" }),
  ])("壊れた値や余分な秘密を復元しない", (raw) => {
    // 捕まえる変異: strictObject を object にして未知フィールドを許す。
    expect(loadNip46Session(raw)).toBeUndefined();
  });
});
