import { describe, expect, it } from "vite-plus/test";
import { buildRelayAuth, isAuthRequired } from "./relay-auth";

describe("buildRelayAuth", () => {
  it("tags the relay URL and the challenge", () => {
    expect(buildRelayAuth("wss://a/", "abc")).toEqual({
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
