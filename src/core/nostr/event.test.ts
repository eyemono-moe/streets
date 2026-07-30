import { schnorr } from "@noble/curves/secp256k1.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import { describe, expect, it } from "vitest";
import {
  type NostrEvent,
  type UnsignedEvent,
  computeEventId,
  verifyEvent,
} from "./event";

// 決定的な秘密鍵。テストの再現性のため固定する。
const secretKey = Uint8Array.from({ length: 32 }, (_, i) => i + 1);
const pubkey = bytesToHex(schnorr.getPublicKey(secretKey));

const sign = (overrides: Partial<UnsignedEvent> = {}): NostrEvent => {
  const unsigned: UnsignedEvent = {
    pubkey,
    created_at: 1_700_000_000,
    kind: 1,
    tags: [["e", "a".repeat(64)]],
    content: "hello nostr",
    ...overrides,
  };
  const id = computeEventId(unsigned);
  return {
    ...unsigned,
    id,
    sig: bytesToHex(schnorr.sign(hexToBytes(id), secretKey)),
  };
};

describe("computeEventId", () => {
  it("is stable for the same input", () => {
    const event = sign();
    const { id, sig, ...unsigned } = event;
    expect(computeEventId(unsigned)).toBe(id);
  });

  it("changes when any serialized field changes", () => {
    const { id, sig, ...unsigned } = sign();
    expect(computeEventId({ ...unsigned, content: "different" })).not.toBe(id);
    expect(computeEventId({ ...unsigned, kind: 7 })).not.toBe(id);
    expect(computeEventId({ ...unsigned, created_at: 1 })).not.toBe(id);
    expect(computeEventId({ ...unsigned, tags: [] })).not.toBe(id);
  });

  it("produces a 64 character lowercase hex string", () => {
    const { id } = sign();
    expect(id).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("verifyEvent", () => {
  it("accepts a correctly signed event", () => {
    expect(verifyEvent(sign())).toBe(true);
  });

  it("rejects an event whose content was tampered with", () => {
    // content を変えると id が合わなくなる
    expect(verifyEvent({ ...sign(), content: "tampered" })).toBe(false);
  });

  it("rejects an event whose id does not match its fields", () => {
    expect(verifyEvent({ ...sign(), id: "0".repeat(64) })).toBe(false);
  });

  it("rejects an event signed by a different key", () => {
    const otherKey = Uint8Array.from({ length: 32 }, (_, i) => i + 2);
    const event = sign();
    const forged = {
      ...event,
      sig: bytesToHex(schnorr.sign(hexToBytes(event.id), otherKey)),
    };
    expect(verifyEvent(forged)).toBe(false);
  });

  it("rejects an event with a malformed signature", () => {
    expect(verifyEvent({ ...sign(), sig: "zz" })).toBe(false);
  });
});
