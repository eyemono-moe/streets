import { describe, expect, it } from "vite-plus/test";
import { isLocalNetworkRelay, normalizeRelayUrl } from "./relay-url";

describe("normalizeRelayUrl", () => {
  it("adds a trailing slash to a bare host", () => {
    expect(normalizeRelayUrl("wss://relay.example")).toBe(
      "wss://relay.example/",
    );
  });

  it("treats a trailing slash as equivalent", () => {
    expect(normalizeRelayUrl("wss://relay.example/")).toBe(
      "wss://relay.example/",
    );
  });

  it("lowercases the host but preserves the path", () => {
    expect(normalizeRelayUrl("wss://Relay.Example/Inbox")).toBe(
      "wss://relay.example/Inbox",
    );
  });

  it("keeps a port", () => {
    expect(normalizeRelayUrl("ws://127.0.0.1:8081")).toBe(
      "ws://127.0.0.1:8081/",
    );
  });

  it("rejects non-websocket schemes", () => {
    expect(normalizeRelayUrl("https://relay.example")).toBeUndefined();
  });

  it("rejects garbage", () => {
    expect(normalizeRelayUrl("not a url")).toBeUndefined();
    expect(normalizeRelayUrl("")).toBeUndefined();
  });
});

describe("isLocalNetworkRelay", () => {
  it.each([
    "ws://localhost:7777",
    "ws://relay.localhost",
    "ws://127.0.0.1:8080",
    "ws://0.0.0.0",
    "wss://10.1.2.3",
    "wss://172.16.0.1",
    "wss://172.31.255.255",
    "wss://192.168.1.10",
    "wss://169.254.0.1",
    "wss://100.64.0.1",
    "ws://[::1]:8080",
    "ws://[fd12:3456::1]",
    "ws://[fe80::1]",
    "ws://[::ffff:127.0.0.1]",
    "ws://umbrel.local",
    "ws://relay.internal",
    "ws://nas.lan",
    "ws://nas.home.arpa",
    "ws://localhost.:7777",
  ])("treats %s as local", (url) => {
    expect(isLocalNetworkRelay(normalizeRelayUrl(url) ?? url)).toBe(true);
  });

  it.each([
    "wss://relay.damus.io",
    "wss://172.32.0.1",
    "wss://192.169.0.1",
    "wss://8.8.8.8",
    "wss://[2001:db8::1]",
    "wss://local.example.com",
    "wss://localhost.example.com",
    // 社内の DNS で引ける名前かもしれないが、見分けられない。
    "wss://relay",
  ])("treats %s as public", (url) => {
    expect(isLocalNetworkRelay(normalizeRelayUrl(url) ?? url)).toBe(false);
  });
});
