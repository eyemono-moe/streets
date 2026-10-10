import { describe, expect, it } from "vite-plus/test";
import {
  NIP46_REQUIRED_PERMISSIONS,
  type StoredNip46SessionV3,
  loadNip46Session,
  saveNip46Session,
} from "./session-storage";

const session: StoredNip46SessionV3 = {
  version: 3,
  permissions: NIP46_REQUIRED_PERMISSIONS,
  clientSecret: "1".repeat(64),
  remoteSignerPubkey: "2".repeat(64),
  userPubkey: "3".repeat(64),
  relays: ["wss://relay.example/"],
};

describe("NIP-46 session storage", () => {
  it.each([
    // 投稿・返信・リアクション・チャット・投票・Zap。
    1, 5, 6, 7, 40, 41, 42, 43, 44, 1018, 1111, 9734,
    // プロフィール・各種設定・デッキ・ステータス。
    0, 3, 10000, 10001, 10002, 10003, 10005, 10006, 10007, 10030, 10063, 30078,
    30000, 30315,
    // リレーとメディアサーバーの認証。
    22242, 24242,
  ])("kind:%i の署名権限を要求する", (kind) => {
    expect(NIP46_REQUIRED_PERMISSIONS.split(",")).toContain(
      `sign_event:${kind}`,
    );
  });

  it("保存形式をround tripする", () => {
    expect(loadNip46Session(saveNip46Session(session))).toEqual(session);
  });

  it("求める権限が増える前に繋いだログインも、そのとき求めた権限のまま戻す", () => {
    // 捕まえる変異: いまの要求と違う権限の保存を捨てる（kind を足すたびに全員が繋ぎ直しになる）
    const older = {
      ...session,
      permissions:
        "sign_event:1,sign_event:6,sign_event:7,nip44_encrypt,nip44_decrypt,nip04_decrypt",
    };
    expect(loadNip46Session(JSON.stringify(older))).toEqual(older);
  });

  it.each([
    "not json",
    // 捕まえる変異: デッキ同期権限追加前の v2 セッションをそのまま復元する。
    JSON.stringify({ ...session, version: 2 }),
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
