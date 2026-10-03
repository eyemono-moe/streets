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
    30315,
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

  it.each([
    "not json",
    // 捕まえる変異: デッキ同期権限追加前の v2 セッションをそのまま復元する。
    JSON.stringify({ ...session, version: 2 }),
    // kind:1111 などを追加する前の接続を復元しても、署名器の承認は増えない。
    JSON.stringify({
      ...session,
      permissions:
        "sign_event:1,sign_event:6,sign_event:7,sign_event:10000,sign_event:30078,nip44_encrypt,nip44_decrypt,nip04_decrypt",
    }),
    // 捕まえる変異: version だけを更新した権限不足の session を復元する。
    JSON.stringify({
      ...session,
      permissions:
        "sign_event:1,sign_event:10000,nip44_encrypt,nip44_decrypt,nip04_decrypt",
    }),
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
