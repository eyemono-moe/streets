import { schnorr } from "@noble/curves/secp256k1.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import { describe, expect, it } from "vitest";
import { type NostrEvent, computeEventId } from "../nostr/event";
import { EventStore } from "./event-store";
import { RoutingTable } from "./routing-table";

const keyFor = (seed: number) =>
  Uint8Array.from(
    Array.from({ length: 32 }, (_, i) => ((seed + i * 7) % 255) + 1),
  );

const relayList = (
  seed: number,
  tags: string[][],
  createdAt = 1_700_000_000,
): NostrEvent => {
  const sk = keyFor(seed);
  const unsigned = {
    pubkey: bytesToHex(schnorr.getPublicKey(sk)),
    created_at: createdAt,
    kind: 10002,
    tags,
    content: "",
  };
  const id = computeEventId(unsigned);
  return { ...unsigned, id, sig: bytesToHex(schnorr.sign(hexToBytes(id), sk)) };
};

describe("RoutingTable", () => {
  it("returns no relays for an author with no relay list", () => {
    const table = new RoutingTable(new EventStore());
    expect(table.writeRelaysFor("f".repeat(64))).toEqual([]);
  });

  it("returns the author's write relays", () => {
    const store = new EventStore();
    const event = relayList(1, [
      ["r", "wss://write.example", "write"],
      ["r", "wss://read.example", "read"],
    ]);
    store.put(event, "wss://indexer");

    const table = new RoutingTable(store);
    expect(table.writeRelaysFor(event.pubkey)).toEqual([
      "wss://write.example/",
    ]);
    expect(table.readRelaysFor(event.pubkey)).toEqual(["wss://read.example/"]);
  });

  it("treats a marker-less relay as both read and write", () => {
    const store = new EventStore();
    const event = relayList(2, [["r", "wss://both.example"]]);
    store.put(event, "wss://indexer");

    const table = new RoutingTable(store);
    expect(table.writeRelaysFor(event.pubkey)).toEqual(["wss://both.example/"]);
    expect(table.readRelaysFor(event.pubkey)).toEqual(["wss://both.example/"]);
  });

  it("returns every declared write relay without truncating", () => {
    const store = new EventStore();
    const event = relayList(3, [
      ["r", "wss://one/", "write"],
      ["r", "wss://two/", "write"],
      ["r", "wss://three/", "write"],
      ["r", "wss://four/", "write"],
      ["r", "wss://five/", "write"],
    ]);
    store.put(event, "wss://indexer");

    // 予算は大域セレクタが持つので、ここは事実だけを返す
    expect(new RoutingTable(store).writeRelaysFor(event.pubkey)).toEqual([
      "wss://one/",
      "wss://two/",
      "wss://three/",
      "wss://four/",
      "wss://five/",
    ]);
  });

  it("uses the newest relay list when several versions are stored", () => {
    const store = new EventStore();
    const older = relayList(4, [["r", "wss://old.example", "write"]], 1_000);
    const newer = relayList(4, [["r", "wss://new.example", "write"]], 2_000);
    store.put(newer, "wss://indexer");
    store.put(older, "wss://indexer");

    expect(new RoutingTable(store).writeRelaysFor(newer.pubkey)).toEqual([
      "wss://new.example/",
    ]);
  });

  it("reflects a relay list that arrives after the table was created", () => {
    const store = new EventStore();
    const table = new RoutingTable(store);
    const event = relayList(5, [["r", "wss://late.example", "write"]]);

    expect(table.writeRelaysFor(event.pubkey)).toEqual([]);
    store.put(event, "wss://indexer");
    expect(table.writeRelaysFor(event.pubkey)).toEqual(["wss://late.example/"]);
  });
});
