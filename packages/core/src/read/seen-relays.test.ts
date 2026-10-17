import { schnorr } from "@noble/curves/secp256k1.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import { describe, expect, it } from "vite-plus/test";
import { type NostrEvent, computeEventId } from "../nostr/event";
import type { RelayUrl } from "../relay/relay-connection";
import { EventStore } from "./event-store";
import { relayHintFor } from "./seen-relays";

const note = (): NostrEvent => {
  const sk = Uint8Array.from({ length: 32 }, (_, i) => i + 1);
  const unsigned = {
    pubkey: bytesToHex(schnorr.getPublicKey(sk)),
    created_at: 1_700_000_000,
    kind: 1,
    tags: [],
    content: "hi",
  };
  const id = computeEventId(unsigned);
  return { ...unsigned, id, sig: bytesToHex(schnorr.sign(hexToBytes(id), sk)) };
};

const OUTBOX = "wss://outbox.example/" as RelayUrl;
const routing = { writeRelaysFor: () => [OUTBOX] };

describe("relayHintFor", () => {
  it("受け取ったリレーがあればそれを使う", () => {
    const store = new EventStore();
    const event = note();
    store.put(event, "wss://seen.example" as RelayUrl);
    expect(relayHintFor(store, routing, event)).toBe("wss://seen.example/");
  });

  it("受け取ったリレーが分からなければ、作者の書き込みリレーを使う", () => {
    const store = new EventStore();
    const event = note();
    store.put(event, "embedded" as RelayUrl);
    expect(relayHintFor(store, routing, event)).toBe(OUTBOX);
  });

  it("どちらも分からなければ undefined", () => {
    const event = note();
    expect(
      relayHintFor(new EventStore(), { writeRelaysFor: () => [] }, event),
    ).toBeUndefined();
  });
});
