import { schnorr } from "@noble/curves/secp256k1.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import { describe, expect, it, vi } from "vitest";
import { type NostrEvent, computeEventId } from "../nostr/event";
import { FakeRelayConnection } from "../relay/fake-relay-connection";
import type {
  RelayConnection,
  RelayFilter,
  RelaySubscription,
  RelaySubscriptionHandlers,
  RelayUrl,
} from "../relay/relay-connection";
import { warmUpRouting } from "./bootstrap";
import { ConnectionPool } from "./connection-pool";
import { EventStore } from "./event-store";
import { RoutingTable } from "./routing-table";

/**
 * A RelayConnection whose subscription `close()` is a true no-op: unlike
 * FakeRelayConnection, it does not remember "closed" and does not suppress
 * further onEose/onClosed calls once a subscription has been closed. This
 * exists to prove that `collect()`'s own per-connection settle guard (not
 * FakeRelayConnection's `sub.closed` early-return) is what stops a second
 * EOSE/CLOSED for the same connection from double-counting.
 */
class UnguardedConnection implements RelayConnection {
  readonly handlers: RelaySubscriptionHandlers[] = [];
  closed = false;
  readonly #closeListeners = new Set<() => void>();

  constructor(readonly url: RelayUrl) {}

  subscribe(
    _filters: RelayFilter[],
    handlers: RelaySubscriptionHandlers,
  ): RelaySubscription {
    this.handlers.push(handlers);
    return { close: () => {} };
  }

  async publish(): Promise<void> {}

  close(): void {
    this.closed = true;
    for (const listener of this.#closeListeners) listener();
  }

  onClose(listener: () => void): () => void {
    if (this.closed) {
      listener();
      return () => {};
    }
    this.#closeListeners.add(listener);
    return () => {
      this.#closeListeners.delete(listener);
    };
  }

  fireEose(index: number): void {
    this.handlers[index]?.onEose();
  }

  fireClosed(index: number, reason: string): void {
    this.handlers[index]?.onClosed(reason);
  }
}

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

/** Builds a ConnectionPool backed by FakeRelayConnection, recording every
 * connection it creates in `connections` keyed by url (later reconnects to
 * the same url overwrite the earlier entry, which is intentional --
 * warmUpRouting closes an indexer's sole subscription the moment it settles,
 * and the pool tears the underlying connection down with it (ADR-0011: give
 * the budget back as soon as it's not needed), so a second query phase to
 * the same indexer opens a fresh connection). */
const poolWithFakes = (
  connections: Map<RelayUrl, FakeRelayConnection>,
  options?: { maxConnections?: number; failFor?: Set<RelayUrl> },
) =>
  new ConnectionPool({
    connect: (url) => {
      if (options?.failFor?.has(url)) {
        throw new Error("connection refused");
      }
      const relay = new FakeRelayConnection(url);
      connections.set(url, relay);
      return relay;
    },
    maxConnections: options?.maxConnections,
  });

describe("warmUpRouting", () => {
  it("fetches the follow list then every followee's relay list in one query", async () => {
    const relays = new Map<RelayUrl, FakeRelayConnection>();
    const store = new EventStore();
    const pool = poolWithFakes(relays);

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
      pool,
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

    // 第 2 段: 全員分の kind:10002 を 1 クエリで。フェーズ 1 の唯一の購読が
    // 片付いた時点でプールはその接続そのものを閉じている (ADR-0011: 使わなく
    // なった予算はすぐ返す) ので、`indexer()` はフェーズ 2 用に新しく張られた
    // 接続を指す — その接続にとってはこれが最初の購読になる。
    await vi.waitFor(() => expect(indexer()?.subscriptions).toHaveLength(1));
    const second = indexer()?.subscriptions[0].filters[0];
    expect(second?.kinds).toEqual([10002]);
    expect(new Set(second?.authors)).toEqual(
      new Set([alice.pubkey, bob.pubkey]),
    );

    indexer()?.emitEvent(0, alice);
    indexer()?.emitEose(0);

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
    const pool = poolWithFakes(relays);

    const pending = warmUpRouting({
      pubkey: "f".repeat(64),
      store,
      pool,
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
    const pool = poolWithFakes(relays);
    const pending = warmUpRouting({
      pubkey: "f".repeat(64),
      store: new EventStore(),
      pool,
      indexers: ["wss://one/", "wss://two/"],
    });

    await vi.waitFor(() => expect(relays.size).toBe(2));
    for (const relay of relays.values()) relay.emitEose(0);
    await pending;

    for (const relay of relays.values()) expect(relay.closed).toBe(true);
    // ウォームアップが持っていた分の予算はもう誰も握っていない (ambiguity 3:
    // release on completion)。
    expect(pool.size).toBe(0);
  });

  it("keeps warming up when one indexer fails to connect", async () => {
    const relays = new Map<RelayUrl, FakeRelayConnection>();
    const pool = poolWithFakes(relays, { failFor: new Set(["wss://down/"]) });

    const pending = warmUpRouting({
      pubkey: "f".repeat(64),
      store: new EventStore(),
      pool,
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
    const relays = new Map<RelayUrl, FakeRelayConnection>();
    const pool = poolWithFakes(relays, {
      failFor: new Set(["wss://a/", "wss://b/"]),
    });

    const pending = warmUpRouting({
      pubkey: "f".repeat(64),
      store: new EventStore(),
      pool,
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
    const pool = poolWithFakes(relays);

    const pending = warmUpRouting({
      pubkey: "f".repeat(64),
      store: new EventStore(),
      pool,
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

  it("does not double-settle a connection on EOSE-then-CLOSED even when the connection's own close() does not suppress redelivery", async () => {
    const one = new UnguardedConnection("wss://one/");
    const two = new UnguardedConnection("wss://two/");
    const byUrl = new Map<RelayUrl, UnguardedConnection>([
      ["wss://one/", one],
      ["wss://two/", two],
    ]);

    const pool = new ConnectionPool({
      connect: (url) => {
        const connection = byUrl.get(url);
        if (!connection) throw new Error(`unexpected url: ${url}`);
        return connection;
      },
    });

    const pending = warmUpRouting({
      pubkey: "f".repeat(64),
      store: new EventStore(),
      pool,
      indexers: ["wss://one/", "wss://two/"],
    });

    let resolved = false;
    pending.then(() => {
      resolved = true;
    });

    await vi.waitFor(() => expect(one.handlers).toHaveLength(1));
    await vi.waitFor(() => expect(two.handlers).toHaveLength(1));

    // Fire EOSE then CLOSED for "one" through a connection whose close()
    // does NOT suppress further emits. If collect() relied on that
    // suppression instead of its own per-connection settle guard, this
    // would decrement pending twice and resolve before "two" ever answers.
    one.fireEose(0);
    one.fireClosed(0, "extra close after eose");

    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(resolved).toBe(false);

    two.fireEose(0);

    await expect(pending).resolves.toEqual({
      followees: [],
      routed: 0,
      unroutable: 0,
    });
  });

  it("closes a settled connection's subscription immediately, without waiting for other connections to settle", async () => {
    const relays = new Map<RelayUrl, FakeRelayConnection>();
    const pool = poolWithFakes(relays);
    const pending = warmUpRouting({
      pubkey: "f".repeat(64),
      store: new EventStore(),
      pool,
      indexers: ["wss://one/", "wss://two/"],
    });

    await vi.waitFor(() =>
      expect(relays.get("wss://one/")?.subscriptions).toHaveLength(1),
    );
    await vi.waitFor(() =>
      expect(relays.get("wss://two/")?.subscriptions).toHaveLength(1),
    );

    relays.get("wss://one/")?.emitEose(0);

    // "one" settled; its subscription must be closed right away — not
    // batched until "two" (which has not answered yet) also settles, and
    // not deferred to warmUpRouting's outer `finally`.
    expect(relays.get("wss://one/")?.subscriptions[0].closed).toBe(true);
    expect(relays.get("wss://two/")?.subscriptions[0].closed).toBe(false);
    // Unlike the pre-pool implementation, closing "one"'s subscription also
    // tears its connection down immediately: it was the pool's only entry
    // for that url, so the pool gives the budget slot back right away
    // (ADR-0011) instead of holding it open until warm-up's outer `finally`
    // closes everything at the very end.
    expect(relays.get("wss://one/")?.closed).toBe(true);

    relays.get("wss://two/")?.emitEose(0);
    await pending;
  });

  it("does not hang past the timeout when an indexer never responds", async () => {
    vi.useFakeTimers();
    try {
      const relays = new Map<RelayUrl, FakeRelayConnection>();
      const pool = poolWithFakes(relays);

      const pending = warmUpRouting({
        pubkey: "f".repeat(64),
        store: new EventStore(),
        pool,
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

  // Ambiguity 1 in the task-11 brief: indexers must open even when the
  // global connection budget is already full, otherwise Outbox routing
  // could never bootstrap in the first place — the exact circularity
  // ConnectionPool's `reserved` escape exists to break.
  it("opens indexers even when the pool is already at its budget", () => {
    const connections = new Map<RelayUrl, FakeRelayConnection>();
    const pool = poolWithFakes(connections, { maxConnections: 1 });
    pool.subscribe("wss://busy/", [{ kinds: [1] }], {
      onEvent: () => {},
      onEose: () => {},
      onClosed: () => {},
    });
    expect(pool.size).toBe(1);

    const promise = warmUpRouting({
      pubkey: "f".repeat(64),
      store: new EventStore(),
      pool,
      indexers: ["wss://indexer/"],
      // Keep the real (unfaked) 10s default timeout from lingering past
      // this test's lifetime — nothing in this test settles the indexer.
      timeoutMs: 20,
    });

    // ウォームアップが走れないとルーティングが永久に成立しない。
    expect(connections.has("wss://indexer/")).toBe(true);
    void promise;
  });

  // Ambiguity 3 in the task-11 brief: warm-up's reserved connections must
  // not sit in the pool afterwards holding budget.
  it("releases the indexer connections when warm-up finishes", async () => {
    const connections = new Map<RelayUrl, FakeRelayConnection>();
    const pool = poolWithFakes(connections);

    const promise = warmUpRouting({
      pubkey: "f".repeat(64),
      store: new EventStore(),
      pool,
      indexers: ["wss://indexer/"],
    });

    await vi.waitFor(() =>
      expect(connections.get("wss://indexer/")?.subscriptions).toHaveLength(1),
    );
    connections.get("wss://indexer/")?.emitEose(0);

    await promise;
    expect(pool.size).toBe(0);
  });
});
