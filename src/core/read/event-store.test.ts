import { schnorr } from "@noble/curves/secp256k1.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import { describe, expect, it } from "vitest";
import { type NostrEvent, computeEventId } from "../nostr/event";
import { EventStore } from "./event-store";

// Task 1 と同じく、その場で署名して自己整合的なイベントを作る
const secretKey = Uint8Array.from({ length: 32 }, (_, i) => i + 1);
const pubkey = bytesToHex(schnorr.getPublicKey(secretKey));

const sign = (content = "hello nostr"): NostrEvent => {
  const unsigned = {
    pubkey,
    created_at: 1_700_000_000,
    kind: 1,
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
