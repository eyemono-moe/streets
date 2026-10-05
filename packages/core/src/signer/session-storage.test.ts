import { describe, expect, it } from "vite-plus/test";
import {
  LOGIN_METHOD_STORAGE_KEY,
  LOGIN_PUBKEY_STORAGE_KEY,
  loadLoginMethod,
  loadLoginPubkey,
  saveLoginMethod,
} from "./session-storage";

describe("login method storage", () => {
  it.each(["nip07", "nip46"] as const)("%s をround tripする", (method) => {
    expect(loadLoginMethod(saveLoginMethod(method))).toBe(method);
  });

  it.each([null, "", "nip-07", "unknown"])(
    "未保存または不正な値を復元しない",
    (raw) => {
      expect(loadLoginMethod(raw)).toBeUndefined();
    },
  );

  it("保存先のキーを固定する", () => {
    expect(LOGIN_METHOD_STORAGE_KEY).toBe("streets.v1.login-method");
  });
});

describe("login pubkey storage", () => {
  it("64 桁の16進だけを読む", () => {
    expect(loadLoginPubkey("a".repeat(64))).toBe("a".repeat(64));
    expect(loadLoginPubkey(null)).toBeUndefined();
    expect(loadLoginPubkey("A".repeat(64))).toBeUndefined();
    expect(loadLoginPubkey("a".repeat(63))).toBeUndefined();
  });

  it("保存先のキーを固定する", () => {
    expect(LOGIN_PUBKEY_STORAGE_KEY).toBe("streets.v1.login-pubkey");
  });
});
