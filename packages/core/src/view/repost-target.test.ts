import { schnorr } from "@noble/curves/secp256k1.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import { describe, expect, it } from "vitest";
import { type NostrEvent, computeEventId } from "../nostr/event";
import { EventStore } from "../read/event-store";
import { resolveRepostTarget } from "./repost-target";

const secretKey = Uint8Array.from({ length: 32 }, (_, i) => i + 1);
const pubkey = bytesToHex(schnorr.getPublicKey(secretKey));

const sign = (
  kind: number,
  content: string,
  tags: string[][] = [],
  created_at = 1_700_000_000,
): NostrEvent => {
  const unsigned = { pubkey, created_at, kind, tags, content };
  const id = computeEventId(unsigned);
  return {
    ...unsigned,
    id,
    sig: bytesToHex(schnorr.sign(hexToBytes(id), secretKey)),
  };
};

const original = sign(1, "元の投稿");
const other = sign(1, "別の投稿", [], 1_700_000_001);

const repost = (content: string, tags: string[][]): NostrEvent =>
  sign(6, content, tags, 1_700_000_100);

describe("resolveRepostTarget", () => {
  it("puts the embedded event into the store so it renders without a fetch", () => {
    const store = new EventStore();
    const event = repost(JSON.stringify(original), [
      ["e", original.id, "wss://relay.example"],
    ]);

    expect(resolveRepostTarget(event, store)).toEqual({
      form: "id",
      id: original.id,
      relay: "wss://relay.example",
    });
    expect(store.get(original.id)).toEqual(original);
  });

  it("drops an embedded event whose signature does not verify", () => {
    const store = new EventStore();
    const forged = { ...original, content: "書き換えた投稿" };
    const event = repost(JSON.stringify(forged), [["e", original.id]]);

    expect(resolveRepostTarget(event, store)).toEqual({
      form: "id",
      id: original.id,
    });
    expect(store.get(original.id)).toBeUndefined();
  });

  it("ignores an embedded event that is not the one the e tag points at", () => {
    const store = new EventStore();
    const event = repost(JSON.stringify(other), [["e", original.id]]);

    expect(resolveRepostTarget(event, store)).toEqual({
      form: "id",
      id: original.id,
    });
    expect(store.get(other.id)).toBeUndefined();
  });

  it("falls back to the e tag when content is empty or broken", () => {
    const store = new EventStore();

    for (const content of ["", "{ not json"]) {
      expect(
        resolveRepostTarget(repost(content, [["e", original.id]]), store),
      ).toEqual({ form: "id", id: original.id });
    }
    expect(store.get(original.id)).toBeUndefined();
  });

  it("uses a verified embedded event when the e tag is missing", () => {
    const store = new EventStore();
    const event = repost(JSON.stringify(original), []);

    expect(resolveRepostTarget(event, store)).toEqual({
      form: "id",
      id: original.id,
    });
    expect(store.get(original.id)).toEqual(original);
  });

  it("returns nothing when there is neither an e tag nor a usable embed", () => {
    const store = new EventStore();

    expect(resolveRepostTarget(repost("", []), store)).toBeUndefined();
  });
});
