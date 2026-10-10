import { describe, expect, it } from "vite-plus/test";
import {
  NIP46_REQUIRED_PERMISSIONS,
  NIP46_SESSION_STORAGE_KEY,
  type StoredNip46SessionV3,
} from "../nip46/session-storage";
import {
  LOGIN_STORAGE_KEY,
  type StoredLogin,
  loadStoredLogin,
  saveStoredLogin,
} from "./stored-login";

const PUBKEY = "a".repeat(64);
const session: StoredNip46SessionV3 = {
  version: 3,
  permissions: NIP46_REQUIRED_PERMISSIONS,
  clientSecret: "1".repeat(64),
  remoteSignerPubkey: "2".repeat(64),
  userPubkey: "3".repeat(64),
  relays: ["wss://relay.example/"],
};

const storage = (entries: Record<string, string>) => ({
  getItem: (key: string) => entries[key] ?? null,
});

describe("loadStoredLogin", () => {
  it.each<StoredLogin>([
    { version: 1, method: "nip07", pubkey: PUBKEY },
    { version: 1, method: "nip07" },
    { version: 1, method: "nip46", session },
    { version: 1, method: "nosskey", pubkey: PUBKEY },
  ])("保存した形を読み戻す（$method）", (login) => {
    expect(
      loadStoredLogin(storage({ [LOGIN_STORAGE_KEY]: saveStoredLogin(login) })),
    ).toEqual({ type: "login", login, legacy: false });
  });

  it("何も保存していなければ、ログインしていない", () => {
    expect(loadStoredLogin(storage({}))).toEqual({ type: "none" });
  });

  it("壊れた保存は、読めないと分かる形で返す", () => {
    // 捕まえる変異: 読めない保存を「保存なし」にする（なぜログアウトしたのか分からない）
    expect(
      loadStoredLogin(storage({ [LOGIN_STORAGE_KEY]: "not json" })),
    ).toEqual({ type: "unreadable" });
    expect(
      loadStoredLogin(
        storage({
          [LOGIN_STORAGE_KEY]: JSON.stringify({
            version: 1,
            method: "nip46",
            session: { ...session, clientSecret: "secret" },
          }),
        }),
      ),
    ).toEqual({ type: "unreadable" });
  });

  describe("1 つの記録にまとめる前の保存", () => {
    // 捕まえる変異: 読み替えを外す（前の版でログインした人が全員ログアウトされる）
    it("拡張機能のログインを、覚えていた公開鍵ごと読み替える", () => {
      expect(
        loadStoredLogin(
          storage({
            "streets.v1.login-method": "nip07",
            "streets.v1.login-pubkey": PUBKEY,
          }),
        ),
      ).toEqual({
        type: "login",
        legacy: true,
        login: { version: 1, method: "nip07", pubkey: PUBKEY },
      });
    });

    it("NIP-46 のログインを読み替える", () => {
      expect(
        loadStoredLogin(
          storage({
            "streets.v1.login-method": "nip46",
            [NIP46_SESSION_STORAGE_KEY]: JSON.stringify(session),
          }),
        ),
      ).toEqual({
        type: "login",
        legacy: true,
        login: { version: 1, method: "nip46", session },
      });
    });

    it("方式を覚える前の版の NIP-46 のセッションも読み替える", () => {
      expect(
        loadStoredLogin(
          storage({ [NIP46_SESSION_STORAGE_KEY]: JSON.stringify(session) }),
        ),
      ).toMatchObject({ type: "login", legacy: true });
    });

    it("NIP-46 と覚えていてセッションが読めなければ、読めないと返す", () => {
      expect(
        loadStoredLogin(storage({ "streets.v1.login-method": "nip46" })),
      ).toEqual({ type: "unreadable" });
    });

    it("新しい記録があれば、前の保存より優先する", () => {
      const login: StoredLogin = {
        version: 1,
        method: "nip07",
        pubkey: PUBKEY,
      };
      expect(
        loadStoredLogin(
          storage({
            [LOGIN_STORAGE_KEY]: saveStoredLogin(login),
            [NIP46_SESSION_STORAGE_KEY]: JSON.stringify(session),
          }),
        ),
      ).toEqual({ type: "login", login, legacy: false });
    });
  });
});
