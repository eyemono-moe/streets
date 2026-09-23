import { describe, expect, it } from "vitest";
import {
  LOGIN_METHOD_STORAGE_KEY,
  loadLoginMethod,
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
