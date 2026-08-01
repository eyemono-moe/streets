import { schnorr } from "@noble/curves/secp256k1.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import { describe, expect, it } from "vitest";
import { type NostrEvent, computeEventId } from "../nostr/event";
import { EventStore } from "./event-store";

// Task 1 と同じく、その場で署名して自己整合的なイベントを作る
const secretKey = Uint8Array.from({ length: 32 }, (_, i) => i + 1);
const pubkey = bytesToHex(schnorr.getPublicKey(secretKey));

const sign = (
  content = "hello nostr",
  overrides: { kind?: number; created_at?: number } = {},
): NostrEvent => {
  const unsigned = {
    pubkey,
    created_at: overrides.created_at ?? 1_700_000_000,
    kind: overrides.kind ?? 1,
    tags: [],
    content,
  };
  const id = computeEventId(unsigned);
  return {
    ...unsigned,
    id,
    sig: bytesToHex(schnorr.sign(hexToBytes(id), secretKey)),
  };
};

const validEvent = sign();

describe("EventStore", () => {
  it("stores a valid event once and tracks every relay that saw it", () => {
    const store = new EventStore();

    expect(store.put(validEvent, "wss://a")).toBe("inserted");
    expect(store.put(validEvent, "wss://b")).toBe("duplicate");

    expect(store.get(validEvent.id)).toEqual(validEvent);
    expect(store.seenRelays(validEvent.id)).toEqual(["wss://a", "wss://b"]);
    expect(store.size).toBe(1);
  });

  it("does not record the same relay twice", () => {
    const store = new EventStore();

    store.put(validEvent, "wss://a");
    store.put(validEvent, "wss://a");

    expect(store.seenRelays(validEvent.id)).toEqual(["wss://a"]);
  });

  it("rejects events whose signature does not verify", () => {
    const store = new EventStore();
    const tampered = { ...validEvent, content: "tampered" };

    expect(store.put(tampered, "wss://a")).toBe("rejected");
    expect(store.size).toBe(0);
  });

  it("returns a copy of seenRelays to prevent external mutation", () => {
    const store = new EventStore();
    store.put(validEvent, "wss://a");

    const relays = store.seenRelays(validEvent.id);
    relays.push("wss://attacker.com");

    expect(store.seenRelays(validEvent.id)).toEqual(["wss://a"]);
  });

  it("does not credit a relay that sends a forged payload under a genuine id", () => {
    const store = new EventStore();
    store.put(validEvent, "wss://a");

    const forged = { ...validEvent, content: "forged" };

    expect(store.put(forged, "wss://attacker.com")).toBe("duplicate");
    expect(store.seenRelays(validEvent.id)).toEqual(["wss://a"]);
  });

  it("keeps the original genuine event after a forged duplicate delivery", () => {
    const store = new EventStore();
    store.put(validEvent, "wss://a");

    const forged = { ...validEvent, content: "forged" };
    store.put(forged, "wss://attacker.com");

    expect(store.get(validEvent.id)).toEqual(validEvent);
  });
});

describe("EventStore.latestReplaceable", () => {
  it("returns undefined when nothing is stored for that author", () => {
    const store = new EventStore();
    expect(store.latestReplaceable(10002, "f".repeat(64))).toBeUndefined();
  });

  it("returns the version with the greatest created_at", () => {
    const store = new EventStore();
    const older = sign("older", { kind: 10002, created_at: 1_000 });
    const newer = sign("newer", { kind: 10002, created_at: 2_000 });

    store.put(newer, "wss://a");
    store.put(older, "wss://a");

    expect(store.latestReplaceable(10002, newer.pubkey)?.content).toBe("newer");
  });

  it("does not confuse kinds or authors", () => {
    const store = new EventStore();
    const relayList = sign("relays", { kind: 10002, created_at: 1_000 });
    store.put(relayList, "wss://a");

    expect(store.latestReplaceable(3, relayList.pubkey)).toBeUndefined();
    expect(store.latestReplaceable(10002, "0".repeat(64))).toBeUndefined();
  });

  // NIP-01: "In case of replaceable events with the same timestamp, the
  // event with the lowest id (first in lexical order) should be retained."
  // (nostr-protocol/nips 01.md:101)
  const findTiedPair = () => {
    const a = sign("tie-a", { kind: 10002, created_at: 1_000 });
    const b = sign("tie-b", { kind: 10002, created_at: 1_000 });
    return a.id < b.id ? { lower: a, higher: b } : { lower: b, higher: a };
  };

  it("keeps the lexicographically smaller id when created_at ties and it arrives second", () => {
    const store = new EventStore();
    const { lower, higher } = findTiedPair();

    store.put(higher, "wss://a");
    store.put(lower, "wss://a");

    expect(store.latestReplaceable(10002, lower.pubkey)?.id).toBe(lower.id);
  });

  it("keeps the lexicographically smaller id when created_at ties and it arrives first", () => {
    const store = new EventStore();
    const { lower, higher } = findTiedPair();

    store.put(lower, "wss://a");
    store.put(higher, "wss://a");

    expect(store.latestReplaceable(10002, lower.pubkey)?.id).toBe(lower.id);
  });

  // The signature-verification gate in put() runs before #indexReplaceable.
  // This is the single invariant protecting the routing table from
  // unverified relay input: a relay cannot force a routing-table update by
  // resending a bad-signature event with a newer created_at.
  it("leaves the replaceable index untouched when a newer-but-forged event is rejected", () => {
    const store = new EventStore();
    const genuine = sign("genuine relay list", {
      kind: 10002,
      created_at: 1_000,
    });
    store.put(genuine, "wss://a");

    const forged = {
      ...sign("attacker relay list", { kind: 10002, created_at: 2_000 }),
      sig: "00".repeat(64),
    };

    expect(store.put(forged, "wss://attacker.com")).toBe("rejected");
    expect(store.latestReplaceable(10002, genuine.pubkey)).toEqual(genuine);
  });

  it("prefers a strictly newer version even when the older one has the smaller id", () => {
    // Search for a content pair where the *older* event happens to have the
    // lexicographically smaller (or equal) id. This is the exact shape that
    // would fool a tie-break that compares ids before checking created_at:
    // such a bug would wrongly keep "older" here instead of replacing it.
    const findCase = () => {
      for (let i = 0; i < 100; i++) {
        const older = sign(`older-${i}`, { kind: 10002, created_at: 1_000 });
        const newer = sign(`newer-${i}`, { kind: 10002, created_at: 2_000 });
        if (older.id <= newer.id) return { older, newer };
      }
      throw new Error("could not find a matching id/created_at combination");
    };
    const store = new EventStore();
    const { older, newer } = findCase();

    store.put(older, "wss://a");
    store.put(newer, "wss://a");

    expect(store.latestReplaceable(10002, older.pubkey)?.content).toBe(
      newer.content,
    );
  });
});
