import { schnorr } from "@noble/curves/secp256k1.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import { describe, expect, it, vi } from "vitest";
import { type NostrEvent, computeEventId } from "../nostr/event";
import { FakeRelayConnection } from "../relay/fake-relay-connection";
import type { RelayUrl } from "../relay/relay-connection";
import { warmUpRouting } from "./bootstrap";
import { EventStore } from "./event-store";
import { RoutingTable } from "./routing-table";

const keyFor = (seed: number) =>
  Uint8Array.from(
    Array.from({ length: 32 }, (_, i) => ((seed + i * 7) % 255) + 1),
  );

const sign = (
  seed: number,
  fields: Omit<NostrEvent, "id" | "pubkey" | "sig">,
) => {
  const sk = keyFor(seed);
  const unsigned = { ...fields, pubkey: bytesToHex(schnorr.getPublicKey(sk)) };
  const id = computeEventId(unsigned);
  return { ...unsigned, id, sig: bytesToHex(schnorr.sign(hexToBytes(id), sk)) };
};

const base = { created_at: 1_700_000_000, tags: [], content: "" };

describe("warmUpRouting", () => {
  it("fetches the follow list then every followee's relay list in one query", async () => {
    const relays = new Map<RelayUrl, FakeRelayConnection>();
    const store = new EventStore();

    const alice = sign(1, {
      ...base,
      kind: 10002,
      tags: [["r", "wss://alice/", "write"]],
    });
    const bob = sign(2, {
      ...base,
      kind: 10002,
      tags: [["r", "wss://bob/", "write"]],
    });
    const viewer = sign(3, {
      ...base,
      kind: 3,
      tags: [
        ["p", alice.pubkey],
        ["p", bob.pubkey],
      ],
    });

    const pending = warmUpRouting({
      pubkey: viewer.pubkey,
      store,
      connect: (url) => {
        const relay = new FakeRelayConnection(url);
        relays.set(url, relay);
        return relay;
      },
      indexers: ["wss://indexer/"],
    });

    const indexer = () => relays.get("wss://indexer/");
    // 第 1 段: フォローリスト
    await vi.waitFor(() => expect(indexer()?.subscriptions).toHaveLength(1));
    expect(indexer()?.subscriptions[0].filters).toEqual([
      { kinds: [3], authors: [viewer.pubkey], limit: 1 },
    ]);
    indexer()?.emitEvent(0, viewer);
    indexer()?.emitEose(0);

    // 第 2 段: 全員分の kind:10002 を 1 クエリで
    await vi.waitFor(() => expect(indexer()?.subscriptions).toHaveLength(2));
    const second = indexer()?.subscriptions[1].filters[0];
    expect(second?.kinds).toEqual([10002]);
    expect(new Set(second?.authors)).toEqual(
      new Set([alice.pubkey, bob.pubkey]),
    );

    indexer()?.emitEvent(1, alice);
    indexer()?.emitEose(1);

    const result = await pending;
    expect(result.followees).toHaveLength(2);
    expect(result.routed).toBe(1);
    expect(result.unroutable).toBe(1);

    const table = new RoutingTable(store);
    expect(table.writeRelaysFor(alice.pubkey)).toEqual(["wss://alice/"]);
    expect(table.writeRelaysFor(bob.pubkey)).toEqual([]);
  });

  it("resolves with an empty follow list when the viewer has no kind:3", async () => {
    const relays = new Map<RelayUrl, FakeRelayConnection>();
    const store = new EventStore();

    const pending = warmUpRouting({
      pubkey: "f".repeat(64),
      store,
      connect: (url) => {
        const relay = new FakeRelayConnection(url);
        relays.set(url, relay);
        return relay;
      },
      indexers: ["wss://indexer/"],
    });

    await vi.waitFor(() =>
      expect(relays.get("wss://indexer/")?.subscriptions).toHaveLength(1),
    );
    relays.get("wss://indexer/")?.emitEose(0);

    await expect(pending).resolves.toEqual({
      followees: [],
      routed: 0,
      unroutable: 0,
    });
  });

  it("closes every connection it opened", async () => {
    const relays = new Map<RelayUrl, FakeRelayConnection>();
    const pending = warmUpRouting({
      pubkey: "f".repeat(64),
      store: new EventStore(),
      connect: (url) => {
        const relay = new FakeRelayConnection(url);
        relays.set(url, relay);
        return relay;
      },
      indexers: ["wss://one/", "wss://two/"],
    });

    await vi.waitFor(() => expect(relays.size).toBe(2));
    for (const relay of relays.values()) relay.emitEose(0);
    await pending;

    for (const relay of relays.values()) expect(relay.closed).toBe(true);
  });

  it("keeps warming up when one indexer fails to connect", async () => {
    const relays = new Map<RelayUrl, FakeRelayConnection>();

    const pending = warmUpRouting({
      pubkey: "f".repeat(64),
      store: new EventStore(),
      connect: (url) => {
        if (url === "wss://down/") throw new Error("connection refused");
        const relay = new FakeRelayConnection(url);
        relays.set(url, relay);
        return relay;
      },
      indexers: ["wss://down/", "wss://up/"],
    });

    await vi.waitFor(() =>
      expect(relays.get("wss://up/")?.subscriptions).toHaveLength(1),
    );
    relays.get("wss://up/")?.emitEose(0);

    await expect(pending).resolves.toEqual({
      followees: [],
      routed: 0,
      unroutable: 0,
    });
    expect(relays.get("wss://up/")?.closed).toBe(true);
  });

  it("resolves gracefully when every indexer fails to connect", async () => {
    const pending = warmUpRouting({
      pubkey: "f".repeat(64),
      store: new EventStore(),
      connect: () => {
        throw new Error("connection refused");
      },
      indexers: ["wss://a/", "wss://b/"],
    });

    await expect(pending).resolves.toEqual({
      followees: [],
      routed: 0,
      unroutable: 0,
    });
  });

  it("does not settle a connection twice on EOSE-then-CLOSED, and still waits for the other connection", async () => {
    const relays = new Map<RelayUrl, FakeRelayConnection>();

    const pending = warmUpRouting({
      pubkey: "f".repeat(64),
      store: new EventStore(),
      connect: (url) => {
        const relay = new FakeRelayConnection(url);
        relays.set(url, relay);
        return relay;
      },
      indexers: ["wss://one/", "wss://two/"],
    });

    let resolved = false;
    pending.then(() => {
      resolved = true;
    });

    await vi.waitFor(() =>
      expect(relays.get("wss://one/")?.subscriptions).toHaveLength(1),
    );
    await vi.waitFor(() =>
      expect(relays.get("wss://two/")?.subscriptions).toHaveLength(1),
    );

    // "one" reports EOSE and then CLOSED for the same subscription — a
    // relay quirk that must not count as two settlements.
    relays.get("wss://one/")?.emitEose(0);
    relays.get("wss://one/")?.emitClosed(0, "extra close after eose");

    // Give pending microtasks a chance to run. Warm-up must still be
    // waiting on "two" — it must not have resolved early.
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(resolved).toBe(false);

    relays.get("wss://two/")?.emitEose(0);

    await expect(pending).resolves.toEqual({
      followees: [],
      routed: 0,
      unroutable: 0,
    });
    expect(relays.get("wss://one/")?.closed).toBe(true);
    expect(relays.get("wss://two/")?.closed).toBe(true);
  });

  it("does not hang past the timeout when an indexer never responds", async () => {
    vi.useFakeTimers();
    try {
      const relays = new Map<RelayUrl, FakeRelayConnection>();

      const pending = warmUpRouting({
        pubkey: "f".repeat(64),
        store: new EventStore(),
        connect: (url) => {
          const relay = new FakeRelayConnection(url);
          relays.set(url, relay);
          return relay;
        },
        indexers: ["wss://silent/"],
        timeoutMs: 25,
      });

      let resolved = false;
      pending.then(() => {
        resolved = true;
      });

      await vi.advanceTimersByTimeAsync(25);

      expect(resolved).toBe(true);
      await expect(pending).resolves.toEqual({
        followees: [],
        routed: 0,
        unroutable: 0,
      });
      expect(relays.get("wss://silent/")?.closed).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});
