import { describe, expect, it } from "vite-plus/test";
import { assertNip46SignPermission } from "../../signer/nip46/session-storage";
import { buildRelayAuth, isAuthRequired } from "./relay-auth";

describe("buildRelayAuth", () => {
  it("tags the relay URL and the challenge", () => {
    const draft = buildRelayAuth("wss://a/", "abc");
    assertNip46SignPermission(draft.kind);
    expect(draft).toEqual({
      kind: 22_242,
      tags: [
        ["relay", "wss://a/"],
        ["challenge", "abc"],
      ],
      content: "",
    });
  });
});

describe("isAuthRequired", () => {
  it("matches only the auth-required prefix", () => {
    expect(isAuthRequired("auth-required: members only")).toBe(true);
    expect(isAuthRequired("restricted: not a member")).toBe(false);
    expect(isAuthRequired("blocked: auth-required:")).toBe(false);
  });
});
