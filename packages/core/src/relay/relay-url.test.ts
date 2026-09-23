import { describe, expect, it } from "vitest";
import { normalizeRelayUrl } from "./relay-url";

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
