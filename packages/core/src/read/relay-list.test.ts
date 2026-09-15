import { describe, expect, it } from "vitest";
import type { NostrEvent } from "../nostr/event";
import { parseRelayList } from "./relay-list";

const relayListEvent = (tags: string[][]): NostrEvent => ({
  id: "a".repeat(64),
  pubkey: "b".repeat(64),
  created_at: 1_700_000_000,
  kind: 10002,
  tags,
  content: "",
  sig: "c".repeat(128),
});

describe("parseRelayList", () => {
  it("treats a marker-less entry as both read and write", () => {
    expect(parseRelayList(relayListEvent([["r", "wss://a.example"]]))).toEqual([
      { url: "wss://a.example/", read: true, write: true },
    ]);
  });

  it("honours read and write markers", () => {
    expect(
      parseRelayList(
        relayListEvent([
          ["r", "wss://a.example", "read"],
          ["r", "wss://b.example", "write"],
        ]),
      ),
    ).toEqual([
      { url: "wss://a.example/", read: true, write: false },
      { url: "wss://b.example/", read: false, write: true },
    ]);
  });

  it("normalizes urls so that trailing-slash variants collapse", () => {
    expect(
      parseRelayList(
        relayListEvent([
          ["r", "wss://a.example"],
          ["r", "wss://a.example/"],
        ]),
      ),
    ).toEqual([{ url: "wss://a.example/", read: true, write: true }]);
  });

  it("ignores tags that are not r tags", () => {
    expect(
      parseRelayList(
        relayListEvent([
          ["p", "d".repeat(64)],
          ["r", "wss://a.example"],
        ]),
      ),
    ).toEqual([{ url: "wss://a.example/", read: true, write: true }]);
  });

  it("drops unparseable and non-websocket urls", () => {
    expect(
      parseRelayList(
        relayListEvent([["r", "https://a.example"], ["r", "not a url"], ["r"]]),
      ),
    ).toEqual([]);
  });

  it("ignores an unknown marker rather than dropping the entry", () => {
    expect(
      parseRelayList(relayListEvent([["r", "wss://a.example", "sometimes"]])),
    ).toEqual([{ url: "wss://a.example/", read: true, write: true }]);
  });

  it("skips malformed tags without throwing (null, non-array, non-string url)", () => {
    expect(
      parseRelayList({
        id: "a".repeat(64),
        pubkey: "b".repeat(64),
        created_at: 1_700_000_000,
        kind: 10002,
        tags: [
          null as unknown as string[],
          { foo: "bar" } as unknown as string[],
          ["r", 42] as unknown as string[],
          ["r", "wss://a.example"],
        ],
        content: "",
        sig: "c".repeat(128),
      }),
    ).toEqual([{ url: "wss://a.example/", read: true, write: true }]);
  });

  it("merges read and write flags when same url appears with both markers", () => {
    expect(
      parseRelayList(
        relayListEvent([
          ["r", "wss://a.example", "read"],
          ["r", "wss://a.example", "write"],
        ]),
      ),
    ).toEqual([{ url: "wss://a.example/", read: true, write: true }]);
  });

  it("merges marker-less with marked entries for the same url", () => {
    expect(
      parseRelayList(
        relayListEvent([
          ["r", "wss://a.example"],
          ["r", "wss://a.example", "read"],
        ]),
      ),
    ).toEqual([{ url: "wss://a.example/", read: true, write: true }]);
  });
});
