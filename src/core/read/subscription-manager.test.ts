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
import { EventStore } from "./event-store";
import { createFakeClock } from "./fake-clock";
import { RoutingTable } from "./routing-table";
import {
  DEGRADED_REPLAN_BATCH_MS,
  type SectionDelivery,
  type SectionHandle,
  type SectionPlan,
  SubscriptionManager,
  type SubscriptionManagerOptions,
  planEqual,
} from "./subscription-manager";

const keyFor = (seed: number) =>
  Uint8Array.from(
    Array.from({ length: 32 }, (_, i) => ((seed + i * 7) % 255) + 1),
  );

const signed = (
  seed: number,
  overrides: Partial<NostrEvent> = {},
): NostrEvent => {
  const sk = keyFor(seed);
  const unsigned = {
    pubkey: bytesToHex(schnorr.getPublicKey(sk)),
    created_at: overrides.created_at ?? 1_700_000_000,
    kind: overrides.kind ?? 1,
    tags: overrides.tags ?? [],
    content: overrides.content ?? "note",
  };
  const id = computeEventId(unsigned);
  return { ...unsigned, id, sig: bytesToHex(schnorr.sign(hexToBytes(id), sk)) };
};

const setup = () => {
  const relays = new Map<RelayUrl, FakeRelayConnection>();
  const store = new EventStore();
  const manager = new SubscriptionManager({
    store,
    routing: new RoutingTable(store),
    connect: (url) => {
      const existing = relays.get(url);
      if (existing) throw new Error(`connect called twice for ${url}`);
      const relay = new FakeRelayConnection(url);
      relays.set(url, relay);
      return relay;
    },
    fallbackRelays: ["wss://fallback/"],
  });
  const delivery = () => ({
    onEvent: vi.fn(),
    onRelayComplete: vi.fn(),
    onRelayUnreachable: vi.fn(),
    onPlanChanged: vi.fn(),
    onRelayRestarted: vi.fn(),
  });
  return { relays, store, manager, delivery };
};

// Task 6 helpers: replan() pools demand across every registered section, so
// these tests need to mint many distinct authors (each with its own kind:10002)
// and inspect a manager's global connection set rather than a single relay's
// subscriptions. `seedByPubkey` lets `relayListFor` take a pubkey (as the brief
// specifies) while still being able to sign for it, by remembering which seed
// produced that pubkey.
const seedByPubkey = new Map<string, number>();

const pubkeyFor = (seed: number): string => {
  const pubkey = bytesToHex(schnorr.getPublicKey(keyFor(seed)));
  seedByPubkey.set(pubkey, seed);
  return pubkey;
};

// Same construction as routing-table.test.ts's `relayList` helper, but keyed
// by pubkey (via the seed cache above) so call sites read naturally as
// "this author's relay list" rather than "the event for seed N".
const relayListFor = (
  pubkey: string,
  urls: RelayUrl[],
  createdAt = 1_700_000_000,
): NostrEvent => {
  const seed = seedByPubkey.get(pubkey);
  if (seed === undefined) {
    throw new Error(
      `relayListFor: ${pubkey} was not minted via pubkeyFor, cannot sign for it`,
    );
  }
  const sk = keyFor(seed);
  const unsigned = {
    pubkey,
    created_at: createdAt,
    kind: 10002,
    tags: urls.map((url) => ["r", url, "write"]),
    content: "",
  };
  const id = computeEventId(unsigned);
  return { ...unsigned, id, sig: bytesToHex(schnorr.sign(hexToBytes(id), sk)) };
};

const noopDelivery = (): SectionDelivery => ({
  onEvent: () => {},
  onRelayComplete: () => {},
  onRelayUnreachable: () => {},
  onPlanChanged: () => {},
  onRelayRestarted: () => {},
});

type CreateManagerOptions = Partial<
  Pick<
    SubscriptionManagerOptions,
    "maxConnections" | "redundancy" | "fallbackRelays" | "scheduler"
  >
>;

const createManager = (options: CreateManagerOptions = {}) => {
  const connections = new Map<RelayUrl, FakeRelayConnection>();
  const connectCalls: RelayUrl[] = [];
  const store = new EventStore();
  const manager = new SubscriptionManager({
    store,
    routing: new RoutingTable(store),
    connect: (url) => {
      connectCalls.push(url);
      const existing = connections.get(url);
      if (existing) throw new Error(`connect called twice for ${url}`);
      const relay = new FakeRelayConnection(url);
      connections.set(url, relay);
      return relay;
    },
    fallbackRelays: options.fallbackRelays ?? ["wss://fallback/"],
    maxConnections: options.maxConnections,
    redundancy: options.redundancy,
    scheduler: options.scheduler,
  });
  return { manager, store, connections, connectCalls };
};

// Puts a kind:10002 into `store` for each of `to - from` freshly-minted
// authors, each declaring its own distinct write relay, then returns the
// pubkeys. Seeds are offset by 10_000 + `from` so they never collide with the
// small seeds `signed()` uses elsewhere in this file.
const authorsWithRelays = (
  store: EventStore,
  from: number,
  to: number,
): string[] => {
  const authors: string[] = [];
  for (let i = from; i < to; i++) {
    const pubkey = pubkeyFor(10_000 + i);
    store.put(relayListFor(pubkey, [`wss://relay-${i}/`]), "wss://indexer/");
    authors.push(pubkey);
  }
  return authors;
};

const subscribeWithPlans = (
  manager: SubscriptionManager,
  filters: RelayFilter[],
  relays?: RelayUrl[],
) => {
  const plans: SectionPlan[] = [];
  const delivery: SectionDelivery = {
    onEvent: vi.fn(),
    onRelayComplete: vi.fn(),
    onRelayUnreachable: vi.fn(),
    onPlanChanged: (plan) => plans.push(plan),
    onRelayRestarted: vi.fn(),
  };
  const handle = manager.subscribe(filters, relays, delivery);
  // The initial plan arrives through the return value, not onPlanChanged
  // (subscribe() must not fire the callback for the section it just
  // registered — the caller doesn't hold the handle yet). Seeding `plans`
  // with it here means `plans.at(-1)` is always the current plan either way.
  plans.push(handle.initialPlan);
  return { delivery, plans, handle };
};

const createManagerWithSection = (
  authors: string[],
  managerOptions: CreateManagerOptions = {},
) => {
  // Always wired to a fake clock (rather than only when a caller cares about
  // the replan debounce) so every test built on this helper can advance time
  // deterministically -- callers that don't touch `clock` are unaffected,
  // since replan() itself stays synchronous (only the kind:10002 -> replan
  // hook goes through the scheduler).
  const clock = createFakeClock();
  const base = createManager({ scheduler: clock, ...managerOptions });
  const { delivery, plans, handle } = subscribeWithPlans(base.manager, [
    { kinds: [1], authors },
  ]);
  return { ...base, delivery, plans, handle, clock };
};

const createManagerWithTwoAuthorsSharingARelay = () => {
  const base = createManager();
  const a = pubkeyFor(20_001);
  const b = pubkeyFor(20_002);
  base.store.put(relayListFor(a, ["wss://shared/"]), "wss://indexer/");
  base.store.put(relayListFor(b, ["wss://shared/"]), "wss://indexer/");
  base.manager.subscribe(
    [{ kinds: [1], authors: [a, b] }],
    undefined,
    noopDelivery(),
  );
  return base;
};

describe("SubscriptionManager", () => {
  it("sends the filters straight to the given relays when relays are specified", () => {
    const { relays, manager, delivery } = setup();
    const d = delivery();

    const handle = manager.subscribe([{ kinds: [1] }], ["wss://given/"], d);

    expect(handle.initialPlan.relays).toEqual(["wss://given/"]);
    expect(relays.get("wss://given/")?.subscriptions[0].filters).toEqual([
      { kinds: [1] },
    ]);
  });

  // Review finding: the explicit-relays branch handed the very same `filters`
  // array instance to every relay via perRelay.set(url, filters). The routed
  // path (query-plan.ts) shallow-copies per relay specifically to prevent
  // this kind of cross-relay aliasing (commit 7416368); the bypass path had
  // reintroduced the hazard it fixed one layer down.
  it("gives each explicitly named relay its own filters array, not a shared reference", () => {
    const { relays, manager, delivery } = setup();
    const filters = [{ kinds: [1] }];

    manager.subscribe(filters, ["wss://one/", "wss://two/"], delivery());

    const filtersOne = relays.get("wss://one/")?.subscriptions[0].filters;
    const filtersTwo = relays.get("wss://two/")?.subscriptions[0].filters;
    expect(filtersOne).toEqual(filters);
    expect(filtersTwo).toEqual(filters);
    expect(filtersOne).not.toBe(filtersTwo);
  });

  it("normalizes explicitly given relay urls", () => {
    const { relays, manager, delivery } = setup();
    manager.subscribe([{ kinds: [1] }], ["wss://given"], delivery());
    expect(relays.has("wss://given/")).toBe(true);
  });

  // ADR-0011 forbids silently dropping a place we couldn't check. An
  // explicit relay list containing a URL that fails normalizeRelayUrl must
  // not just vanish — that would be indistinguishable from "checked
  // everywhere, found nothing". Report it through onRelayUnreachable so it
  // shows up as incomplete, same as a relay that connected and then closed.
  it("reports an unnormalizable explicit relay url as unreachable instead of silently dropping it", () => {
    const { manager, delivery } = setup();
    const d = delivery();

    const handle = manager.subscribe([{ kinds: [1] }], ["not a url"], d);

    expect(d.onRelayUnreachable).toHaveBeenCalledWith("not a url");
    expect(handle.initialPlan.relays).toEqual([]);
    expect(handle.initialPlan.unroutableAuthors).toBe(0);
  });

  it("routes by author when no relays are given", () => {
    const { relays, store, manager, delivery } = setup();
    const author = signed(1, {
      kind: 10002,
      tags: [["r", "wss://author-write/", "write"]],
      content: "",
    });
    store.put(author, "wss://indexer/");

    const handle = manager.subscribe(
      [{ kinds: [1], authors: [author.pubkey] }],
      undefined,
      delivery(),
    );

    expect(handle.initialPlan.relays).toEqual(["wss://author-write/"]);
    expect(handle.initialPlan.unroutableAuthors).toBe(0);
    expect(relays.get("wss://author-write/")?.subscriptions[0].filters).toEqual(
      [{ kinds: [1], authors: [author.pubkey] }],
    );
  });

  it("falls back and reports authors it cannot route", () => {
    const { relays, manager, delivery } = setup();
    const handle = manager.subscribe(
      [{ kinds: [1], authors: ["f".repeat(64)] }],
      undefined,
      delivery(),
    );

    expect(handle.initialPlan.relays).toEqual(["wss://fallback/"]);
    expect(handle.initialPlan.unroutableAuthors).toBe(1);
    expect(relays.has("wss://fallback/")).toBe(true);
  });

  it("opens one connection per relay url even across sections", () => {
    const { manager, delivery } = setup();
    // connect が同じ URL で 2 回呼ばれたら setup の connect が throw する
    manager.subscribe([{ kinds: [1] }], ["wss://shared/"], delivery());
    manager.subscribe([{ kinds: [7] }], ["wss://shared/"], delivery());

    expect(manager.connectionCount).toBe(1);
  });

  it("stores the event and delivers its id, not the event object", () => {
    const { relays, store, manager, delivery } = setup();
    const d = delivery();
    manager.subscribe([{ kinds: [1] }], ["wss://one/"], d);

    const note = signed(2);
    relays.get("wss://one/")?.emitEvent(0, note);

    expect(d.onEvent).toHaveBeenCalledWith(note.id, "wss://one/");
    expect(store.get(note.id)).toEqual(note);
  });

  it("does not deliver an event that fails verification", () => {
    const { relays, manager, delivery } = setup();
    const d = delivery();
    manager.subscribe([{ kinds: [1] }], ["wss://one/"], d);

    const forged = { ...signed(3), content: "tampered" };
    relays.get("wss://one/")?.emitEvent(0, forged);

    expect(d.onEvent).not.toHaveBeenCalled();
  });

  it("削除依頼により hidden になったイベントも所属判定のためセクションへ配信する", () => {
    // 捕まえる変異: hidden を rejected と同じく配信しない。SectionReader が
    // 非表示メンバーを覚えられず、削除依頼の巻き戻し時に対象を戻せない。
    const { relays, store, manager, delivery } = setup();
    const note = signed(4, { created_at: 100 });
    const deletion = signed(4, {
      created_at: 200,
      kind: 5,
      tags: [["e", note.id]],
      content: "delete",
    });
    store.put(deletion, "wss://one/");
    const d = delivery();
    manager.subscribe([{ kinds: [1] }], ["wss://one/"], d);

    relays.get("wss://one/")?.emitEvent(0, note);

    expect(store.isHidden(note.id)).toBe(true);
    expect(d.onEvent).toHaveBeenCalledWith(note.id, "wss://one/");
  });

  it("reports eose and closure per relay", () => {
    const { relays, manager, delivery } = setup();
    const d = delivery();
    manager.subscribe([{ kinds: [1] }], ["wss://one/", "wss://two/"], d);

    relays.get("wss://one/")?.emitEose(0);
    relays.get("wss://two/")?.emitClosed(0, "blocked");

    expect(d.onRelayComplete).toHaveBeenCalledWith("wss://one/");
    expect(d.onRelayUnreachable).toHaveBeenCalledWith("wss://two/");
  });

  it("closes the connection only when the last section using it goes away", () => {
    const { relays, manager, delivery } = setup();
    const first = manager.subscribe(
      [{ kinds: [1] }],
      ["wss://shared/"],
      delivery(),
    );
    const second = manager.subscribe(
      [{ kinds: [7] }],
      ["wss://shared/"],
      delivery(),
    );

    first.close();
    expect(relays.get("wss://shared/")?.closed).toBe(false);
    expect(manager.connectionCount).toBe(1);

    second.close();
    expect(relays.get("wss://shared/")?.closed).toBe(true);
    expect(manager.connectionCount).toBe(0);
  });

  it("stops delivering to a closed section", () => {
    const { relays, manager, delivery } = setup();
    const d = delivery();
    const handle = manager.subscribe([{ kinds: [1] }], ["wss://one/"], d);

    handle.close();
    relays.get("wss://one/")?.emitEvent(0, signed(4));

    expect(d.onEvent).not.toHaveBeenCalled();
  });

  // Task 7 rewrite (ruling A). This test used to assert that connect()
  // throwing for one relay propagated out of manager.subscribe() and rolled
  // back the connections already acquired for earlier relays in the same
  // call. That path is gone by design now: ConnectionPool absorbs connect()
  // failures and reports them through onClosed -> onRelayUnreachable instead
  // of throwing (SectionReader.stop() doesn't try/catch handle.close(), so a
  // throw there used to permanently wedge #started -- see the brief). The
  // already-good connection must simply stay open; nothing rolls back.
  it("keeps an already-acquired relay open and reports the failing one via onRelayUnreachable, instead of throwing, when connect() fails for a later relay in the same subscribe() call", () => {
    const store = new EventStore();
    const opened: FakeRelayConnection[] = [];
    const manager = new SubscriptionManager({
      store,
      routing: new RoutingTable(store),
      connect: (url) => {
        if (url === "wss://broken/") throw new Error("boom");
        const relay = new FakeRelayConnection(url);
        opened.push(relay);
        return relay;
      },
      fallbackRelays: ["wss://fallback/"],
    });

    const unreachable: RelayUrl[] = [];
    expect(() =>
      manager.subscribe([{ kinds: [1] }], ["wss://ok/", "wss://broken/"], {
        onEvent: vi.fn(),
        onRelayComplete: vi.fn(),
        onRelayUnreachable: (relay) => unreachable.push(relay),
        onPlanChanged: vi.fn(),
        onRelayRestarted: vi.fn(),
      }),
    ).not.toThrow();

    expect(opened).toHaveLength(1);
    expect(opened[0].closed).toBe(false);
    // Only wss://ok/ counts as a live connection -- wss://broken/'s pool
    // entry is retained (for a later reconnect, Task 9) with a null
    // connection, which `size` deliberately excludes.
    expect(manager.connectionCount).toBe(1);
    expect(unreachable).toEqual(["wss://broken/"]);
  });

  // Task 7 rewrite (ruling A). Same story as above but the failure point is
  // connection.subscribe() throwing rather than connect() -- a different
  // step of the pool's algorithm, also absorbed rather than propagated.
  // Both sockets "connect" successfully here (connect() never throws in
  // this setup); only wss://broken/'s subscribe() call fails, so per the
  // pool's model that connection is still live (a failed REQ is not a dead
  // socket) -- it simply never got a subscription registered on it.
  it("keeps the connection open and reports unreachable, instead of throwing, when connection.subscribe() itself throws", () => {
    const store = new EventStore();
    const closedUrls: RelayUrl[] = [];
    const manager = new SubscriptionManager({
      store,
      routing: new RoutingTable(store),
      connect: (url) => ({
        url,
        subscribe: () => {
          if (url === "wss://broken/") throw new Error("boom");
          return { close: () => {} };
        },
        publish: async () => {},
        close: () => {
          closedUrls.push(url);
        },
        onOpen: () => () => {},
        onClose: () => () => {},
      }),
      fallbackRelays: ["wss://fallback/"],
    });

    const unreachable: RelayUrl[] = [];
    expect(() =>
      manager.subscribe([{ kinds: [1] }], ["wss://ok/", "wss://broken/"], {
        onEvent: vi.fn(),
        onRelayComplete: vi.fn(),
        onRelayUnreachable: (relay) => unreachable.push(relay),
        onPlanChanged: vi.fn(),
        onRelayRestarted: vi.fn(),
      }),
    ).not.toThrow();

    expect(manager.connectionCount).toBe(2);
    expect(closedUrls).not.toContain("wss://broken/");
    expect(unreachable).toEqual(["wss://broken/"]);
  });

  // Ruling A: PooledSubscription.close() (and therefore SectionHandle.close())
  // must be total. Reproduces the exact chain the brief names: handle.close()
  // ends by calling replan(), which frees budget and lets a previously
  // budget-refused relay attempt connect() for the first time -- if that
  // connect() throws, it must not propagate out of close().
  it("close() never throws even when it frees budget for a relay whose connect() then fails", () => {
    const store = new EventStore();
    const connectAttempts: RelayUrl[] = [];
    const manager = new SubscriptionManager({
      store,
      routing: new RoutingTable(store),
      connect: (url) => {
        connectAttempts.push(url);
        if (url === "wss://broken/") throw new Error("boom");
        return new FakeRelayConnection(url);
      },
      fallbackRelays: ["wss://fallback/"],
      maxConnections: 1,
    });

    const handleA = manager.subscribe(
      [{ kinds: [1] }],
      ["wss://ok/"],
      noopDelivery(),
    );
    const unreachable: RelayUrl[] = [];
    manager.subscribe([{ kinds: [1] }], ["wss://broken/"], {
      onEvent: () => {},
      onRelayComplete: () => {},
      onRelayUnreachable: (relay) => unreachable.push(relay),
      onPlanChanged: () => {},
      onRelayRestarted: () => {},
    });

    // wss://broken/ was budget-refused outright (budget already spent on
    // wss://ok/), so connect() was never even attempted for it yet.
    expect(connectAttempts).toEqual(["wss://ok/"]);

    expect(() => handleA.close()).not.toThrow();

    // Closing A freed the sole slot, so replan() retried wss://broken/ --
    // and connect() threw, absorbed by the pool instead of by close().
    expect(connectAttempts).toContain("wss://broken/");
    expect(unreachable).toContain("wss://broken/");
  });

  // Coverage gap flagged by review round 1: the brief names dispose() vs
  // outstanding handles as a risk area, but no test exercised dispose() at
  // all.
  it("dispose() closes every pooled connection and zeroes connectionCount", () => {
    const { relays, manager, delivery } = setup();
    manager.subscribe(
      [{ kinds: [1] }],
      ["wss://one/", "wss://two/"],
      delivery(),
    );

    manager.dispose();

    expect(relays.get("wss://one/")?.closed).toBe(true);
    expect(relays.get("wss://two/")?.closed).toBe(true);
    expect(manager.connectionCount).toBe(0);
  });

  // Task 12 fix round 1: connectionCount alone cannot prove a budget was
  // ever respected, because sockets that violated it and later died erase
  // the evidence before anyone reads connectionCount. peakConnectionCount
  // is the high-water mark, taken when each socket is actually created, so
  // it survives both close() and dispose().
  it("peakConnectionCount records the high-water mark and survives dispose()", () => {
    const { manager, delivery } = setup();
    manager.subscribe(
      [{ kinds: [1] }],
      ["wss://one/", "wss://two/"],
      delivery(),
    );
    expect(manager.peakConnectionCount).toBe(2);

    manager.dispose();

    expect(manager.connectionCount).toBe(0);
    expect(manager.peakConnectionCount).toBe(2);
  });

  // Review finding: dispose() abandons outstanding SectionHandles instead of
  // neutralizing them. Sequence: subscribe wss://x (refCount 1) -> dispose()
  // clears the pool -> subscribe wss://x again (a *new* connection, refCount
  // 1) -> the stale handle from the first subscribe calls close(), which
  // must not be able to touch the new connection at all.
  it("a handle created before dispose() cannot close a connection acquired after dispose()", () => {
    const store = new EventStore();
    const opened: FakeRelayConnection[] = [];
    const manager = new SubscriptionManager({
      store,
      routing: new RoutingTable(store),
      connect: (url) => {
        const relay = new FakeRelayConnection(url);
        opened.push(relay);
        return relay;
      },
      fallbackRelays: ["wss://fallback/"],
    });

    const staleHandle = manager.subscribe([{ kinds: [1] }], ["wss://x/"], {
      onEvent: vi.fn(),
      onRelayComplete: vi.fn(),
      onRelayUnreachable: vi.fn(),
      onPlanChanged: vi.fn(),
      onRelayRestarted: vi.fn(),
    });

    manager.dispose();

    manager.subscribe([{ kinds: [1] }], ["wss://x/"], {
      onEvent: vi.fn(),
      onRelayComplete: vi.fn(),
      onRelayUnreachable: vi.fn(),
      onPlanChanged: vi.fn(),
      onRelayRestarted: vi.fn(),
    });

    expect(opened).toHaveLength(2);
    const freshConnection = opened[1];

    staleHandle.close();

    expect(freshConnection.closed).toBe(false);
    expect(manager.connectionCount).toBe(1);
  });

  it("dispose() followed by a live handle's close() does not double-close or throw", () => {
    const { relays, manager, delivery } = setup();
    const handle = manager.subscribe(
      [{ kinds: [1] }],
      ["wss://one/"],
      delivery(),
    );
    const connection = relays.get("wss://one/");
    if (!connection) throw new Error("test setup: connection missing");
    const closeSpy = vi.spyOn(connection, "close");

    manager.dispose();

    expect(() => handle.close()).not.toThrow();
    expect(closeSpy).toHaveBeenCalledTimes(1);
    expect(manager.connectionCount).toBe(0);
  });

  // ---------------------------------------------------------------------
  // Final whole-branch review, finding 3: dispose() -> #pool.dispose() ->
  // #drop() closes the connection but never marked entry.closed on the
  // SubscriptionManager's own SectionEntry. With FakeRelayConnection,
  // connection.close() synchronously delivers onClosed to every live
  // subscription (mirroring what WebSocketRelayConnection.fail() does
  // asynchronously for a real socket) -- so that delivery reaches
  // #handlersFor's onClosed handler, whose only guard is `if
  // (!entry.closed)`. If dispose() never sets entry.closed, this fires
  // onRelayUnreachable into a delivery callback whose owning SectionReader
  // already had stop() called (or never gets to, since dispose() was
  // supposed to be the final word).
  // ---------------------------------------------------------------------
  it("marks every entry closed before pool.dispose(), so the pool's synchronous close-delivery cannot reach a delivery callback after dispose()", () => {
    const { manager, delivery } = setup();
    const d = delivery();
    manager.subscribe([{ kinds: [1] }], ["wss://one/"], d);

    manager.dispose();

    expect(d.onRelayUnreachable).not.toHaveBeenCalled();
  });

  // Coverage gap flagged by review round 1: this is the security-relevant
  // property named by the brief (ADR-0024) — a duplicate delivery must
  // still reach every section, and a forged event reusing a known id must
  // never overwrite the verified body in EventStore.
  it("still delivers the id on a duplicate, and never lets a forged duplicate overwrite the stored body", () => {
    const { relays, store, manager, delivery } = setup();
    const dA = delivery();
    const dB = delivery();

    manager.subscribe([{ kinds: [1] }], ["wss://one/"], dA);
    manager.subscribe([{ kinds: [1] }], ["wss://two/"], dB);

    const note = signed(5);
    relays.get("wss://one/")?.emitEvent(0, note);
    // Same genuine event arrives at a second section via a second relay —
    // EventStore.put returns "duplicate" here, not "inserted".
    relays.get("wss://two/")?.emitEvent(0, note);

    expect(dA.onEvent).toHaveBeenCalledWith(note.id, "wss://one/");
    expect(dB.onEvent).toHaveBeenCalledWith(note.id, "wss://two/");

    // A forged payload reuses the already-stored id but changes content.
    // EventStore.put still returns "duplicate" (id collision), never
    // "rejected", and never touches the stored body.
    const forged = { ...note, content: "forged" };
    dB.onEvent.mockClear();
    relays.get("wss://two/")?.emitEvent(0, forged);

    expect(dB.onEvent).toHaveBeenCalledWith(note.id, "wss://two/");
    expect(store.get(note.id)).toEqual(note);
  });

  // Coverage gap flagged by review round 1: the `closed` guard makes a
  // second close() a no-op by inspection, but nothing asserted it.
  it("calling close() twice on a handle only releases the shared connection once", () => {
    const { relays, manager, delivery } = setup();
    const first = manager.subscribe(
      [{ kinds: [1] }],
      ["wss://shared/"],
      delivery(),
    );
    const second = manager.subscribe(
      [{ kinds: [7] }],
      ["wss://shared/"],
      delivery(),
    );

    first.close();
    first.close();

    expect(relays.get("wss://shared/")?.closed).toBe(false);
    expect(manager.connectionCount).toBe(1);

    second.close();
    expect(relays.get("wss://shared/")?.closed).toBe(true);
    expect(manager.connectionCount).toBe(0);
  });

  // Task 6: the budget is global (ADR-0025), so two sections that each look
  // at their own five authors must still share one 30 (here 3) connection
  // ceiling, not each get their own.
  it("shares one budget across every section", () => {
    const { manager, store, connections } = createManager({
      maxConnections: 3,
    });
    manager.subscribe(
      [{ kinds: [1], authors: authorsWithRelays(store, 0, 5) }],
      undefined,
      noopDelivery(),
    );
    manager.subscribe(
      [{ kinds: [1], authors: authorsWithRelays(store, 5, 10) }],
      undefined,
      noopDelivery(),
    );

    expect(connections.size).toBeLessThanOrEqual(3);
  });

  it("re-plans a live section when its routing becomes known", () => {
    const AUTHOR = pubkeyFor(30_001);
    const { manager, store, delivery, plans } = createManagerWithSection([
      AUTHOR,
    ]);
    expect(plans.at(-1)?.relays).toEqual(["wss://fallback/"]);

    store.put(relayListFor(AUTHOR, ["wss://author-write/"]), "wss://fallback/");
    manager.replan();

    expect(plans.at(-1)?.relays).toEqual(["wss://author-write/"]);
    expect(plans.at(-1)?.unroutableAuthors).toBe(0);
    void delivery;
  });

  // The whole point of diffing (rather than tearing down and re-opening
  // everything on every replan) is that a relay both the old and new plan
  // keep is left alone. Without the diff, re-planning would roll every
  // section's phase back from settled to streaming on every replan() call —
  // see the brief's rationale.
  it("does not reopen a relay that both plans keep", () => {
    const { manager, connectCalls } =
      createManagerWithTwoAuthorsSharingARelay();
    const before = connectCalls.length;

    manager.replan();

    expect(connectCalls.length).toBe(before);
  });

  it("reports authors dropped by the budget as uncovered", () => {
    const { manager, store } = createManager({ maxConnections: 1 });
    const authors = authorsWithRelays(store, 100, 105);

    const { plans } = subscribeWithPlans(manager, [{ kinds: [1], authors }]);

    expect(plans.at(-1)?.uncoveredAuthors).toBeGreaterThan(0);
  });

  // Task 7 rewrite (ruling E, 2026-08-01 ADR-0025 addendum). The original
  // version of this test asserted a stronger claim -- "never drops" -- which
  // is no longer true once ConnectionPool is the single place the budget is
  // enforced: ADR-0005's "explicit relays bypass author routing" says
  // nothing about bypassing ADR-0011's socket ceiling, and ADR-0025 already
  // truncates `pinned` at `budget`. What's actually true, and worth testing,
  // is that an explicit relay wins the contest for a scarce slot over a
  // routed one.
  it("prefers an explicitly named relay over a routed one when the budget is tight", () => {
    const { manager, store, connections } = createManager({
      maxConnections: 1,
      fallbackRelays: [],
    });
    manager.subscribe([{ kinds: [1] }], ["wss://named/"], noopDelivery());
    manager.subscribe(
      [{ kinds: [1], authors: authorsWithRelays(store, 200, 205) }],
      undefined,
      noopDelivery(),
    );

    expect([...connections.keys()]).toEqual(["wss://named/"]);
    expect(manager.connectionCount).toBe(1);
  });

  // Ruling E: pinned is priority, not exemption. A section naming more
  // relays than the whole app can afford still gets truncated at the
  // budget -- the surviving relays are reported unreachable through
  // onRelayUnreachable (ruling C: there are no authors behind an explicit
  // relay, so uncoveredAuthors cannot describe this).
  it("truncates an explicit relay list at the budget instead of exempting it from it", () => {
    const { manager, connections } = createManager({ maxConnections: 2 });
    const unreachable: RelayUrl[] = [];

    const handle = manager.subscribe(
      [{ kinds: [1] }],
      ["wss://e1/", "wss://e2/", "wss://e3/"],
      {
        onEvent: () => {},
        onRelayComplete: () => {},
        onRelayUnreachable: (relay) => unreachable.push(relay),
        onPlanChanged: () => {},
        onRelayRestarted: () => {},
      },
    );

    expect(connections.size).toBe(2);
    expect(unreachable).toEqual(["wss://e3/"]);
    // Ruling D: the refused relay stays in plan.relays so SectionReader
    // keeps a record of it (and its unreachable flag) instead of losing it
    // at the next plan change.
    expect(handle.initialPlan.relays).toEqual([
      "wss://e1/",
      "wss://e2/",
      "wss://e3/",
    ]);
  });

  // Ruling B: the widened bug the pool exists to close. planQuery
  // broadcasts an author with no known kind:10002 to every fallback relay
  // -- before Task 7, the manager opened all of them unconditionally, so
  // one unroutable author in a section could burn the app's entire budget
  // on a single fallback broadcast. The pool now caps this exactly like the
  // routed and explicit paths.
  it("caps a fallback broadcast at the budget instead of opening every fallback relay for one unroutable author", () => {
    const { manager, connections } = createManager({
      maxConnections: 1,
      fallbackRelays: ["wss://fb1/", "wss://fb2/", "wss://fb3/"],
    });
    const unreachable: RelayUrl[] = [];

    const handle = manager.subscribe(
      [{ kinds: [1], authors: ["f".repeat(64)] }],
      undefined,
      {
        onEvent: () => {},
        onRelayComplete: () => {},
        onRelayUnreachable: (relay) => unreachable.push(relay),
        onPlanChanged: () => {},
        onRelayRestarted: () => {},
      },
    );

    expect(connections.size).toBe(1);
    expect(unreachable).toEqual(["wss://fb2/", "wss://fb3/"]);
    expect(handle.initialPlan.relays).toEqual([
      "wss://fb1/",
      "wss://fb2/",
      "wss://fb3/",
    ]);
  });

  // ---------------------------------------------------------------------
  // Fix round 1 (post-review). Critical 1: the diff in #applyEntryDiff was
  // keyed on relay URL alone, so a relay that survives both plans kept its
  // stale filters forever even when the set of authors routed to it changed
  // — the section would report settled while an author it should be
  // watching was subscribed nowhere at all (ADR-0011's cardinal sin).
  // ---------------------------------------------------------------------
  it("re-subscribes a kept relay in place when its routed authors change, and reports the restart", () => {
    const { manager, store, connections, connectCalls } = createManager();
    const A = pubkeyFor(40_001);
    const B = pubkeyFor(40_002);
    store.put(relayListFor(A, ["wss://x/"]), "wss://indexer/");
    // B has no kind:10002 yet, so only A reaches wss://x/ on the first plan.

    const restarted: RelayUrl[] = [];
    const delivery: SectionDelivery = {
      onEvent: () => {},
      onRelayComplete: () => {},
      onRelayUnreachable: () => {},
      onPlanChanged: () => {},
      onRelayRestarted: (relay) => restarted.push(relay),
    };
    manager.subscribe([{ kinds: [1], authors: [A, B] }], undefined, delivery);
    expect(connections.get("wss://x/")?.subscriptions.at(-1)?.filters).toEqual([
      { kinds: [1], authors: [A] },
    ]);
    const xConnectCallsBefore = connectCalls.filter(
      (url) => url === "wss://x/",
    ).length;

    // B's kind:10002 arrives declaring the SAME relay A already uses.
    // wss://x/ survives in both the old and new plan, but the author bucket
    // routed to it changes from [A] to [A, B].
    store.put(relayListFor(B, ["wss://x/"]), "wss://indexer/");
    manager.replan();

    // The relay itself must not be torn down and reopened (that guarantee,
    // covered by "does not reopen a relay that both plans keep" above, must
    // survive this fix) — same pooled connection, only the REQ changes.
    expect(connectCalls.filter((url) => url === "wss://x/").length).toBe(
      xConnectCallsBefore,
    );
    expect(restarted).toEqual(["wss://x/"]);
    const live = connections.get("wss://x/")?.subscriptions.at(-1);
    expect(live?.filters).toEqual([{ kinds: [1], authors: [A, B] }]);
    // The stale subscription (still carrying only A) must actually be
    // closed, not left running alongside the new one.
    expect(connections.get("wss://x/")?.subscriptions[0]?.closed).toBe(true);
  });

  // ---------------------------------------------------------------------
  // Fix round 1. Important 3: #planEqual prevents onPlanChanged from firing
  // when a replan() produces the exact same observable plan.
  // ---------------------------------------------------------------------
  it("never fires onPlanChanged when repeated replan() calls produce the same plan", () => {
    const { manager, store } = createManager();
    const A = pubkeyFor(42_001);
    store.put(relayListFor(A, ["wss://only/"]), "wss://indexer/");
    const onPlanChanged = vi.fn();

    manager.subscribe([{ kinds: [1], authors: [A] }], undefined, {
      onEvent: () => {},
      onRelayComplete: () => {},
      onRelayUnreachable: () => {},
      onPlanChanged,
      onRelayRestarted: () => {},
    });

    manager.replan();
    manager.replan();
    manager.replan();

    expect(onPlanChanged).not.toHaveBeenCalled();
  });

  // planEqual is exported specifically so its order-insensitivity can be
  // pinned directly: constructing a genuine "same set, different array
  // order" case through the public API turned out to be effectively
  // impossible (perRelay's key order is a deterministic function of filter
  // author order and each author's own kind:10002 tag order, never of
  // selectRelays' internal pick order), so a direct unit test is the honest
  // way to cover this property rather than a contrived integration scenario.
  it("planEqual treats relay order as insignificant", () => {
    const a: SectionPlan = {
      relays: ["wss://x/", "wss://y/"],
      unroutableAuthors: 0,
      uncoveredAuthors: 0,
    };
    const b: SectionPlan = {
      relays: ["wss://y/", "wss://x/"],
      unroutableAuthors: 0,
      uncoveredAuthors: 0,
    };
    expect(planEqual(a, b)).toBe(true);
  });

  it("planEqual is sensitive to an actual difference in the relay set", () => {
    const a: SectionPlan = {
      relays: ["wss://x/", "wss://y/"],
      unroutableAuthors: 0,
      uncoveredAuthors: 0,
    };
    const b: SectionPlan = {
      relays: ["wss://x/", "wss://z/"],
      unroutableAuthors: 0,
      uncoveredAuthors: 0,
    };
    expect(planEqual(a, b)).toBe(false);
  });

  // ---------------------------------------------------------------------
  // Fix round 1. Important 3: onPlanChanged must never fire synchronously
  // from inside the subscribe() call that registers the section — the
  // caller doesn't hold the handle yet. subscribeWithPlans' `plans` array
  // (seeded manually with initialPlan) can't distinguish "no spurious fire"
  // from "a fire happened but plans already had the right value" — this
  // asserts on the raw callback directly instead.
  // ---------------------------------------------------------------------
  it("never calls onPlanChanged synchronously from within the subscribe() call that registers the section", () => {
    const { manager, store } = createManager();
    const A = pubkeyFor(43_001);
    store.put(relayListFor(A, ["wss://only/"]), "wss://indexer/");
    const onPlanChanged = vi.fn();

    manager.subscribe([{ kinds: [1], authors: [A] }], undefined, {
      onEvent: () => {},
      onRelayComplete: () => {},
      onRelayUnreachable: () => {},
      onPlanChanged,
      onRelayRestarted: () => {},
    });

    expect(onPlanChanged).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------
  // Fix round 1. Critical 2(a): a section registered reentrantly (from
  // inside a delivery callback fired synchronously during an in-progress
  // replan) must not be visited by the still-running outer pass using its
  // stale, pre-registration selection. Built by making one relay answer
  // with a synchronous EOSE (mimicking a very fast relay, the same
  // synchronous-callback contract Task 1 gave dead connections) and
  // reacting to that EOSE by registering a brand new section for an author
  // whose kind:10002 is already known. `planB` mirrors how a real caller
  // combines `initialPlan` with subsequent `onPlanChanged` calls (see
  // SectionReader.start()) — it's the "what does this section's owner
  // actually end up believing" signal, regardless of which exact mechanism
  // (synchronous initialPlan vs. a deferred onPlanChanged) delivers it.
  // ---------------------------------------------------------------------
  it("does not corrupt a section registered reentrantly from inside a replan callback", () => {
    const store = new EventStore();
    const AUTHOR = pubkeyFor(41_001);
    store.put(relayListFor(AUTHOR, ["wss://rc/"]), "wss://indexer/");

    const manager: SubscriptionManager = new SubscriptionManager({
      store,
      routing: new RoutingTable(store),
      connect: (url) => ({
        url,
        subscribe: (filters, handlers) => {
          // Simulate a relay that answers instantly: EOSE fires
          // synchronously, before connection.subscribe() (and therefore
          // manager.subscribe()) returns — exactly like the dead-connection
          // case Task 1 documented, but via onEose instead of onClosed so
          // this test is isolated from Critical 2(b) below.
          if (url === "wss://trigger/") handlers.onEose();
          void filters;
          return { close: () => {} };
        },
        publish: async () => {},
        close: () => {},
        onOpen: () => () => {},
        onClose: () => () => {},
      }),
      fallbackRelays: ["wss://fallback/"],
    });

    const plansB: SectionPlan[] = [];
    let planB: SectionPlan | undefined;
    let handleB: SectionHandle | undefined;

    manager.subscribe([{ kinds: [1] }], ["wss://trigger/"], {
      onEvent: () => {},
      onRelayComplete: () => {
        handleB = manager.subscribe(
          [{ kinds: [1], authors: [AUTHOR] }],
          undefined,
          {
            onEvent: () => {},
            onRelayComplete: () => {},
            onRelayUnreachable: () => {},
            onPlanChanged: (plan) => {
              plansB.push(plan);
              planB = plan;
            },
            onRelayRestarted: () => {},
          },
        );
      },
      onRelayUnreachable: () => {},
      onPlanChanged: () => {},
      onRelayRestarted: () => {},
    });

    if (!planB) planB = handleB?.initialPlan;

    // The section must never, at any point in the sequence, be told its
    // perfectly routable author is unroutable.
    expect(plansB.every((plan) => plan.unroutableAuthors === 0)).toBe(true);
    expect(planB).toEqual({
      relays: ["wss://rc/"],
      unroutableAuthors: 0,
      uncoveredAuthors: 0,
    });
  });

  // ---------------------------------------------------------------------
  // Fix round 1. Critical 2(b): connection.subscribe() on an already-dead
  // pooled connection fires onClosed synchronously (Task 1's contract). If
  // a delivery callback reacts to that by calling replan() itself, the
  // reentrant call must not re-run #applyEntryDiff's "add" loop for the
  // same entry while the original add is still in flight — otherwise it
  // #acquires the same url a second time (a leaked refCount for an orphaned
  // second subscription) and, unbounded, the same synchronous chain
  // recurses without limit.
  // ---------------------------------------------------------------------
  it("does not stack-overflow or double-subscribe when a delivery callback reacts to a dead connection by calling replan()", () => {
    const store = new EventStore();
    let subscribeCallCount = 0;

    const manager: SubscriptionManager = new SubscriptionManager({
      store,
      routing: new RoutingTable(store),
      connect: (url) => ({
        url,
        subscribe: (_filters, handlers) => {
          subscribeCallCount += 1;
          // Always dead: every subscribe() attempt reports closed
          // synchronously, exactly like a pooled connection whose socket
          // already died (Task 1's onClosed contract).
          handlers.onClosed("socket closed");
          return { close: () => {} };
        },
        publish: async () => {},
        close: () => {},
        onOpen: () => () => {},
        onClose: () => () => {},
      }),
      fallbackRelays: ["wss://fallback/"],
    });

    expect(() =>
      manager.subscribe([{ kinds: [1] }], ["wss://dead/"], {
        onEvent: () => {},
        onRelayComplete: () => {},
        // Reacting to the dead relay by asking the manager to re-plan is
        // exactly the pattern the coordinator's repro used to trigger the
        // recursion — deliberately unconditional (no "only once" guard in
        // the test) so a regression would still stack-overflow.
        onRelayUnreachable: () => manager.replan(),
        onPlanChanged: () => {},
        onRelayRestarted: () => {},
      }),
    ).not.toThrow();

    expect(subscribeCallCount).toBe(1);
    expect(manager.connectionCount).toBe(1);
  });

  // ---------------------------------------------------------------------
  // Final whole-branch review, finding 1: the test above only exercises a
  // single relay at the default budget of 30, so the subscribe() there
  // always succeeds -- the URL lands in entry.opened and filtersEqual
  // short-circuits pass 2, so #dirty never gets set a second time. A relay
  // *refused for budget* (pool.subscribe() returns undefined, not a dead
  // connection) never enters entry.opened, so every pass re-attempts it,
  // is refused again, and (with an unconditional onRelayUnreachable ->
  // replan() delivery callback, the pattern the test above documents as
  // supported) sets #dirty every single time -- a synchronous infinite
  // loop. This needs two relays under a budget of 1 so one is accepted and
  // the other is refused on every pass.
  // ---------------------------------------------------------------------
  it("converges to a steady state instead of looping forever when a delivery callback replans after a relay is refused for budget", () => {
    const store = new EventStore();
    const manager = new SubscriptionManager({
      store,
      routing: new RoutingTable(store),
      connect: (url) => new FakeRelayConnection(url),
      fallbackRelays: [],
      maxConnections: 1,
    });

    let unreachableCalls = 0;
    expect(() =>
      manager.subscribe([{ kinds: [1] }], ["wss://one/", "wss://two/"], {
        onEvent: () => {},
        onRelayComplete: () => {},
        // wss://one/ takes the only budget slot; wss://two/ is refused
        // every pass. Reacting to the refusal by replanning, unconditionally,
        // is exactly the pattern the coordinator's repro used.
        onRelayUnreachable: () => {
          unreachableCalls += 1;
          manager.replan();
        },
        onPlanChanged: () => {},
        onRelayRestarted: () => {},
      }),
    ).not.toThrow();

    // wss://two/ must be reported exactly once -- the transition into
    // "refused" -- not once per pass. Reported every pass is the infinite
    // loop; reported zero times would hide the incompleteness ADR-0011
    // forbids.
    expect(unreachableCalls).toBe(1);
    expect(manager.connectionCount).toBe(1);
  });

  // ---------------------------------------------------------------------
  // Final whole-branch review, finding 1 (second half): the transition-only
  // guard above stops *that* particular non-convergent case, but nothing
  // pins that #runReplan's do/while loop is bounded independently of it --
  // if convergence ever fails for a different reason (a delivery callback
  // that keeps manufacturing new demand rather than repeating old demand),
  // the loop must still terminate rather than hang. Every refusal spawns a
  // brand-new section with a brand-new explicit relay (also immediately
  // refused, since the budget is already exhausted by a filler section),
  // recreating a fresh "transition into refused" forever -- convergence
  // never happens by construction.
  // ---------------------------------------------------------------------
  it("bounds the replan loop and reports instead of hanging when convergence keeps failing", () => {
    const store = new EventStore();
    const manager = new SubscriptionManager({
      store,
      routing: new RoutingTable(store),
      connect: (url) => new FakeRelayConnection(url),
      fallbackRelays: [],
      maxConnections: 1,
    });

    // Consumes the only budget slot before the pathological section is
    // registered, so wss://seed/ below is refused on its very first pass.
    manager.subscribe([{ kinds: [1] }], ["wss://filler/"], {
      onEvent: () => {},
      onRelayComplete: () => {},
      onRelayUnreachable: () => {},
      onPlanChanged: () => {},
      onRelayRestarted: () => {},
    });

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    let spawnCount = 0;

    // Every spawned section's own onRelayUnreachable spawns *another* new
    // section the same way -- each one is refused for budget on its first
    // pass (the filler still owns the only slot) and reacts by growing the
    // demand further, so this never settles down on its own.
    const spawningDelivery = (): SectionDelivery => ({
      onEvent: () => {},
      onRelayComplete: () => {},
      onRelayUnreachable: () => {
        spawnCount += 1;
        manager.subscribe(
          [{ kinds: [1] }],
          [`wss://spawned-${spawnCount}/`],
          spawningDelivery(),
        );
      },
      onPlanChanged: () => {},
      onRelayRestarted: () => {},
    });

    expect(() => {
      manager.subscribe([{ kinds: [1] }], ["wss://seed/"], spawningDelivery());
    }).not.toThrow();

    // The loop must have given up rather than spinning forever, and it
    // must have said so.
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  // ---------------------------------------------------------------------
  // Final whole-branch review, finding 2: pool.subscribe() can fire
  // handlers.onClosed *synchronously* (connection.subscribe() throwing is
  // one way this happens -- see connection-pool.ts's "if
  // (!entry.subscription) handlers.onClosed(...)"). That reaches
  // onRelayUnreachable -> an arbitrary delivery callback. If that callback
  // closes the section, #close() drains and clears entry.opened *before*
  // pool.subscribe() has returned to #applyEntryDiff's "new" branch --
  // which then unconditionally does entry.opened.set(url, ...), repopulating
  // a closed entry with a live PooledSubscription nothing will ever close.
  // ---------------------------------------------------------------------
  it("does not leak a socket into a closed entry when pool.subscribe() synchronously reports failure and the delivery callback closes the section", () => {
    const store = new EventStore();
    const A = pubkeyFor(46_003);
    let closeCalls = 0;
    const manager = new SubscriptionManager({
      store,
      routing: new RoutingTable(store),
      connect: (url) => {
        if (url !== "wss://bad/") return new FakeRelayConnection(url);
        return {
          url,
          subscribe: (_filters, _handlers): never => {
            // connection.subscribe() itself fails -- pool.subscribe() catches
            // this and synchronously calls handlers.onClosed(...) before it
            // returns to the manager.
            throw new Error("boom");
          },
          publish: async () => {},
          close: () => {
            closeCalls += 1;
          },
          onOpen: () => () => {},
          onClose: () => () => {},
        };
      },
      fallbackRelays: ["wss://fallback/"],
    });

    // The initial subscribe() must complete normally (and return a handle)
    // before the failing relay ever enters the picture -- otherwise the
    // synchronous failure would fire *during* subscribe() itself, before
    // the caller has a handle to close with, which is a different (already
    // covered) scenario, not this one.
    const handle = manager.subscribe(
      [{ kinds: [1], authors: [A] }],
      undefined,
      {
        onEvent: () => {},
        onRelayComplete: () => {},
        // The section closes itself in reaction to the (synchronous) failure
        // report -- a legitimate thing for a consumer to do. Safe to
        // reference `handle` here even though this closure is created before
        // the `const` initializer finishes: the callback only ever *runs*
        // later (from replan(), below), by which point `handle` is assigned.
        onRelayUnreachable: () => handle.close(),
        onPlanChanged: () => {},
        onRelayRestarted: () => {},
      },
    );
    expect(handle.initialPlan.relays).toEqual(["wss://fallback/"]);

    // A's kind:10002 now resolves to wss://bad/ -- a *new* relay entering
    // this entry's plan (the "new" branch of #applyEntryDiff, not the
    // in-place restart branch), whose subscribe() fails synchronously.
    store.put(relayListFor(A, ["wss://bad/"]), "wss://indexer/");
    expect(() => manager.replan()).not.toThrow();

    // Without the entry.closed guard, #applyEntryDiff repopulates
    // entry.opened with the PooledSubscription after #close() already
    // cleared it. Nothing ever calls .close() on it again, so the
    // underlying connection is never closed and the pool still counts it.
    expect(manager.connectionCount).toBe(0);
    expect(closeCalls).toBeGreaterThan(0);
  });

  // ---------------------------------------------------------------------
  // Final whole-branch review, finding 2 (restart branch): the same hole
  // exists after onRelayRestarted, one branch down in #applyEntryDiff --
  // it fires before the in-place restart's own pool.subscribe() call, so a
  // delivery callback that closes the section there has the identical
  // window to leak a freshly (re)opened subscription into a cleared
  // entry.opened.
  // ---------------------------------------------------------------------
  it("does not leak a socket into a closed entry when onRelayRestarted synchronously closes the section (in-place restart)", () => {
    const store = new EventStore();
    const A = pubkeyFor(46_001);
    const B = pubkeyFor(46_002);
    store.put(relayListFor(A, ["wss://x/"]), "wss://indexer/");

    const manager = new SubscriptionManager({
      store,
      routing: new RoutingTable(store),
      connect: (url) => new FakeRelayConnection(url),
      fallbackRelays: ["wss://fallback/"],
    });

    let restarted = false;
    const handle = manager.subscribe(
      [{ kinds: [1], authors: [A, B] }],
      undefined,
      {
        onEvent: () => {},
        onRelayComplete: () => {},
        onRelayUnreachable: () => {},
        onPlanChanged: () => {},
        onRelayRestarted: () => {
          restarted = true;
          // Safe: this callback only runs later, from replan() below, by
          // which point `handle` is assigned.
          handle.close();
        },
      },
    );

    // B's kind:10002 declares the SAME relay A already uses -- wss://x/
    // survives in both the old and new plan, but the author bucket routed
    // to it changes from [A] to [A, B], triggering the in-place restart
    // for that URL (same shape as the Task 7 fix-round-1 test above).
    store.put(relayListFor(B, ["wss://x/"]), "wss://indexer/");
    expect(() => manager.replan()).not.toThrow();

    expect(restarted).toBe(true);
    // The section closed itself synchronously from inside onRelayRestarted.
    // Nothing should still be holding wss://x/ open on its behalf.
    expect(manager.connectionCount).toBe(0);
  });

  // ---------------------------------------------------------------------
  // Task 7 fix round 1, Important 1: no test at either level covered
  // connection.subscribe() throwing during an *in-place restart* — a URL
  // already pooled and live, whose filters change (same shape as
  // "re-subscribes a kept relay in place..." above), where the re-subscribe
  // call itself fails. This pins the #applyEntryDiff "same relay kept,
  // filters changed" branch specifically: it must converge to exactly one
  // onRelayUnreachable (via the pool's synchronous onClosed, not a second
  // direct call from the manager), leave entry.opened in a state with no
  // leaked duplicate registration for the URL, leave sibling relays
  // untouched, and still let close() be total afterward.
  // ---------------------------------------------------------------------
  it("reports exactly one onRelayUnreachable, leaks nothing, and stays close()-total when connection.subscribe() throws during an in-place restart", () => {
    const store = new EventStore();
    const A = pubkeyFor(45_001);
    const B = pubkeyFor(45_002);
    const C = pubkeyFor(45_003);
    store.put(relayListFor(A, ["wss://x/"]), "wss://indexer/");
    store.put(relayListFor(C, ["wss://c/"]), "wss://indexer/");
    // B has no kind:10002 yet, so only A reaches wss://x/ on the first
    // plan; C's own relay wss://c/ is unrelated and must stay unaffected
    // throughout.

    let xSubscribeCalls = 0;
    let xConnectCalls = 0;
    let xConnectionCloseCalls = 0;
    const manager = new SubscriptionManager({
      store,
      routing: new RoutingTable(store),
      connect: (url) => {
        if (url !== "wss://x/") return new FakeRelayConnection(url);
        xConnectCalls += 1;
        return {
          url,
          subscribe: (filters, _handlers) => {
            xSubscribeCalls += 1;
            void filters;
            // First call (initial open) succeeds; the second call (the
            // in-place restart triggered by B joining A on wss://x/)
            // throws — a fake whose subscribe() fails only on that
            // second call for this URL, per the coordinator's guidance.
            if (xSubscribeCalls === 2) throw new Error("boom");
            return { close: () => {} };
          },
          publish: async () => {},
          close: () => {
            xConnectionCloseCalls += 1;
          },
          onOpen: () => () => {},
          onClose: () => () => {},
        };
      },
      fallbackRelays: [],
    });

    const unreachable: RelayUrl[] = [];
    const handle = manager.subscribe(
      [{ kinds: [1], authors: [A, B, C] }],
      undefined,
      {
        onEvent: () => {},
        onRelayComplete: () => {},
        onRelayUnreachable: (relay) => unreachable.push(relay),
        onPlanChanged: () => {},
        onRelayRestarted: () => {},
      },
    );

    expect(xSubscribeCalls).toBe(1);
    expect(unreachable).toEqual([]);
    expect(manager.connectionCount).toBe(2); // wss://x/ and wss://c/

    // B's kind:10002 arrives declaring the SAME relay A already uses.
    // wss://x/ survives in both the old and new plan, but the author
    // bucket routed to it changes from [A] to [A, B] — triggering the
    // in-place restart, whose subscribe() call is the one wired to throw.
    store.put(relayListFor(B, ["wss://x/"]), "wss://indexer/");
    expect(() => manager.replan()).not.toThrow();

    expect(xSubscribeCalls).toBe(2);
    expect(xConnectCalls).toBe(1); // no second connect() — same connection
    // Exactly one report for wss://x/, converged through the pool's
    // synchronous onClosed -> #handlersFor -> onRelayUnreachable path, not
    // doubled by a separate direct call from the manager.
    expect(unreachable).toEqual(["wss://x/"]);
    // wss://x/'s connection itself is still counted live (only its REQ
    // failed, not the socket) and wss://c/ is untouched by any of this.
    expect(manager.connectionCount).toBe(2);

    // A further replan() with no routing change must not re-attempt the
    // failed restart (entry.opened already reflects the last-attempted
    // [A, B] filters, so the diff sees "unchanged") and must not re-report
    // it — proving there is exactly one live bookkeeping record for
    // wss://x/, not a stale one left over from before the restart.
    manager.replan();
    expect(xSubscribeCalls).toBe(2);
    expect(unreachable).toEqual(["wss://x/"]);

    // close() must still be total, and must actually tear the connection
    // down exactly once — if the failed restart had left a duplicate
    // registration behind (the old entry never released), this would
    // either throw, fire close() more than once, or leave connectionCount
    // showing wss://x/ as still live afterward.
    expect(() => handle.close()).not.toThrow();
    expect(xConnectionCloseCalls).toBe(1);
    expect(manager.connectionCount).toBe(0);
  });

  // ---------------------------------------------------------------------
  // Final whole-branch review, finding 4: #replanOnce iterates every
  // registered entry in one bare for loop, calling onPlanChanged /
  // onRelayUnreachable / onRelayRestarted directly. If one entry's callback
  // throws, entries processed later in that same pass never get their
  // updated plan -- hidden degradation ADR-0011 forbids, triggered by
  // ordinary (if buggy) consumer code, not anything adversarial.
  // ---------------------------------------------------------------------
  it("does not strand later entries in the same replan pass when an earlier entry's onPlanChanged callback throws", () => {
    const store = new EventStore();
    const A = pubkeyFor(47_001);
    const B = pubkeyFor(47_002);

    const manager = new SubscriptionManager({
      store,
      routing: new RoutingTable(store),
      connect: (url) => new FakeRelayConnection(url),
      fallbackRelays: ["wss://fallback/"],
    });

    // Registered first, so #replanOnce's for loop visits it before B.
    const handleA = manager.subscribe(
      [{ kinds: [1], authors: [A] }],
      undefined,
      {
        onEvent: () => {},
        onRelayComplete: () => {},
        onRelayUnreachable: () => {},
        onPlanChanged: () => {
          throw new Error("boom from section A");
        },
        onRelayRestarted: () => {},
      },
    );

    const plansB: SectionPlan[] = [];
    manager.subscribe([{ kinds: [1], authors: [B] }], undefined, {
      onEvent: () => {},
      onRelayComplete: () => {},
      onRelayUnreachable: () => {},
      onPlanChanged: (plan) => plansB.push(plan),
      onRelayRestarted: () => {},
    });

    expect(handleA.initialPlan.relays).toEqual(["wss://fallback/"]);

    // Both authors' relay lists resolve before the SAME replan() call, so
    // #replanOnce's for loop visits both entries in one pass: A (throws)
    // then B (registered after, later in iteration order).
    store.put(relayListFor(A, ["wss://a-write/"]), "wss://indexer/");
    store.put(relayListFor(B, ["wss://b-write/"]), "wss://indexer/");

    expect(() => manager.replan()).not.toThrow();

    expect(plansB.at(-1)?.relays).toEqual(["wss://b-write/"]);
  });

  // ---------------------------------------------------------------------
  // Fix round 1, Important 2: Task 9 added ConnectionPool.retryNow() and
  // ConnectionPoolOptions.scheduler/random, with SubscriptionManager meant
  // to delegate/pass them straight through -- but no test here exercised
  // either, despite both being brief-mandated public interface.
  // ---------------------------------------------------------------------

  it("retryNow() delegates to the pool and reconnects a dead relay immediately", () => {
    const store = new EventStore();
    const connections = new Map<RelayUrl, FakeRelayConnection>();
    const connectCalls: RelayUrl[] = [];
    const clock = createFakeClock();
    const manager = new SubscriptionManager({
      store,
      routing: new RoutingTable(store),
      connect: (url) => {
        connectCalls.push(url);
        const relay = new FakeRelayConnection(url);
        connections.set(url, relay);
        return relay;
      },
      fallbackRelays: [],
      scheduler: clock,
      random: () => 0.5,
    });

    manager.subscribe([{ kinds: [1] }], ["wss://one/"], noopDelivery());
    connections.get("wss://one/")?.die();
    expect(connectCalls).toEqual(["wss://one/"]);

    manager.retryNow();

    // Reconnected immediately -- no clock.advance() at all -- proving
    // retryNow() bypasses the pending backoff timer rather than merely
    // shortening it.
    expect(connectCalls).toEqual(["wss://one/", "wss://one/"]);
  });

  it("passes scheduler and random through to the pool so automatic reconnection is driven by the injected clock, not a real timer", () => {
    const store = new EventStore();
    const connections = new Map<RelayUrl, FakeRelayConnection>();
    const connectCalls: RelayUrl[] = [];
    const clock = createFakeClock();
    const manager = new SubscriptionManager({
      store,
      routing: new RoutingTable(store),
      connect: (url) => {
        connectCalls.push(url);
        const relay = new FakeRelayConnection(url);
        connections.set(url, relay);
        return relay;
      },
      fallbackRelays: [],
      scheduler: clock,
      random: () => 0.5,
    });

    manager.subscribe([{ kinds: [1] }], ["wss://one/"], noopDelivery());
    connections.get("wss://one/")?.die();

    // If `scheduler` weren't actually reaching the pool, it would fall back
    // to a real setTimeout and advancing this fake clock would do nothing --
    // connectCalls would stay at 1 for the rest of this synchronous test.
    clock.advance(999);
    expect(connectCalls).toHaveLength(1);
    // First backoff is exactly 1000 * (0.5 + 0.5) -- deterministic only
    // because `random` also reached the pool; real Math.random() would make
    // this 999-vs-1000 boundary check flaky.
    clock.advance(1);
    expect(connectCalls).toHaveLength(2);
  });

  // Mutation: replan() で degraded を渡し忘れると落ちる。純関数側が正しく
  // なっても配線が無ければ実地の欠陥は直らない —— このテストがその
  // 唯一の防波堤。
  it("excludes a degraded relay on the next replan", () => {
    const store = new EventStore();
    const connections = new Map<RelayUrl, FakeRelayConnection>();
    const clock = createFakeClock();
    const manager = new SubscriptionManager({
      store,
      routing: new RoutingTable(store),
      connect: (url) => {
        // autoOpen: false の接続しか返さない -- 恒久的に到達不能なリレー
        // (`.onion` が実地で示した状況) を再現する。
        const relay = new FakeRelayConnection(url, { autoOpen: false });
        connections.set(url, relay);
        return relay;
      },
      fallbackRelays: [],
      scheduler: clock,
      random: () => 0.5,
    });

    const author = pubkeyFor(40_001);
    store.put(relayListFor(author, ["wss://dead/"]), "wss://indexer/");

    const plans: SectionPlan[] = [];
    const handle = manager.subscribe(
      [{ kinds: [1], authors: [author] }],
      undefined,
      {
        onEvent: () => {},
        onRelayComplete: () => {},
        onRelayUnreachable: () => {},
        onPlanChanged: (plan) => plans.push(plan),
        onRelayRestarted: () => {},
      },
    );

    // Before it degrades, the author's only declared relay is picked as
    // normal.
    expect(handle.initialPlan.relays).toEqual(["wss://dead/"]);

    // DEGRADED_AFTER_FAILURES (4) consecutive relay-attributable failures,
    // advancing the injected clock through each exponential-backoff
    // reconnect in between so the pool actually retries and re-fails --
    // same sequence connection-pool.test.ts uses to reach degraded.
    connections.get("wss://dead/")?.die(); // failure 1
    clock.advance(1000);
    connections.get("wss://dead/")?.die(); // failure 2
    clock.advance(2000);
    connections.get("wss://dead/")?.die(); // failure 3
    clock.advance(4000);
    connections.get("wss://dead/")?.die(); // failure 4 -> degraded

    expect(manager.pool.degradedRelays).toEqual(["wss://dead/"]);

    // ADR-0021: connection death does not itself trigger replan() --
    // callers own that decision. Trigger it explicitly, as replan()'s own
    // doc comment says a routing change would.
    manager.replan();

    expect(plans.at(-1)?.relays).toEqual([]);
    expect(plans.at(-1)?.uncoveredAuthors).toBe(1);
  });
});

// ---------------------------------------------------------------------
// Final review (2026-08-06), Important 1: the test above
// ("excludes a degraded relay on the next replan") proves the pure-function
// wiring (`selectRelays({ degraded })`) is correct, but it drives the
// replan by calling `manager.replan()` by hand -- in the real app, nothing
// ever called that. `SubscriptionManager.#runReplan()` had exactly two
// internal callers (`subscribe()`, `#close()`); a relay dying and staying
// dead never triggered one on its own, so a `.onion`-style permanently
// unreachable relay kept its selection slot forever in production.
//
// These tests drive the same `FakeRelayConnection({ autoOpen: false })` +
// clock-advance sequence as the test above, but *never* call
// `manager.replan()` by hand -- the whole point is that the constructor's
// `pool.onDegradedChanged()` wiring (`connection-pool.ts`) plus the batching
// in `#scheduleDegradedReplan()` (`subscription-manager.ts`) must produce the
// replan on their own. These tests only drive the entry side (crossing into
// degraded); the exit side is covered at the pool level
// (`connection-pool.test.ts`'s `onDegradedChanged` tests) and relies on the
// same batching wired here.
// ---------------------------------------------------------------------
describe("SubscriptionManager: automatic replan on a degraded transition", () => {
  // Mutation: delete `this.#pool.onDegradedChanged(...)` from the
  // constructor (or have it call nothing) -- this is the end-to-end
  // assertion the slice was missing. It fails not with a clearly-wrong
  // number but with the plan simply never changing: `plans` stays empty
  // forever, no matter how far the clock is advanced.
  it("degrading a relay's last connection automatically replans it out, with no manual replan() call", () => {
    const store = new EventStore();
    const connections = new Map<RelayUrl, FakeRelayConnection>();
    const connectCalls: RelayUrl[] = [];
    const clock = createFakeClock();
    const manager = new SubscriptionManager({
      store,
      routing: new RoutingTable(store),
      connect: (url) => {
        connectCalls.push(url);
        // autoOpen: false -- socket objects get created but never prove
        // they opened, same as the real .onion relay this slice was fixing.
        const relay = new FakeRelayConnection(url, { autoOpen: false });
        connections.set(url, relay);
        return relay;
      },
      fallbackRelays: [],
      scheduler: clock,
      random: () => 0.5,
    });

    const author = pubkeyFor(44_001);
    store.put(relayListFor(author, ["wss://dead/"]), "wss://indexer/");

    const plans: SectionPlan[] = [];
    manager.subscribe([{ kinds: [1], authors: [author] }], undefined, {
      onEvent: () => {},
      onRelayComplete: () => {},
      onRelayUnreachable: () => {},
      onPlanChanged: (plan) => plans.push(plan),
      onRelayRestarted: () => {},
    });

    // Same DEGRADED_AFTER_FAILURES (4) exponential-backoff sequence as
    // connection-pool.test.ts and the hand-triggered test above -- but no
    // manager.replan() call anywhere below.
    connections.get("wss://dead/")?.die(); // failure 1
    clock.advance(1000);
    connections.get("wss://dead/")?.die(); // failure 2
    clock.advance(2000);
    connections.get("wss://dead/")?.die(); // failure 3
    clock.advance(4000);
    connections.get("wss://dead/")?.die(); // failure 4 -> crosses into degraded

    // The crossing notification is batched (DEGRADED_REPLAN_BATCH_MS) --
    // nothing has fired synchronously yet.
    expect(manager.pool.degradedRelays).toEqual(["wss://dead/"]);
    expect(plans).toHaveLength(0);

    // Advance past the batch window -> exactly one replan fires.
    clock.advance(DEGRADED_REPLAN_BATCH_MS);

    expect(plans).toHaveLength(1);
    expect(plans[0].relays).toEqual([]);
    expect(plans[0].uncoveredAuthors).toBe(1);

    // "no longer subscribed", made concrete: the replan dropped the last
    // subscriber for wss://dead/, which (per ConnectionPool's `#drop`)
    // cancels its pending reconnect timer too. If it were still subscribed,
    // advancing far past any backoff delay would produce more connect()
    // calls (ADR-0021 "never give up"); since it's gone, it doesn't.
    const callsSoFar = connectCalls.filter((u) => u === "wss://dead/").length;
    clock.advance(120_000);
    expect(connectCalls.filter((u) => u === "wss://dead/").length).toBe(
      callsSoFar,
    );
  });

  // Mutation: revert `retryNow()` to a bare `this.#pool.retryNow()`. The
  // degraded URL's failure history is cleared either way, so
  // `degradedRelays` goes empty and the pool looks healthy -- but nothing
  // re-selects, so the relay stays out of every section's plan. Note the
  // assertions run with NO clock.advance(): once Task 1 notifies on the way
  // out of the degraded set, advancing the clock would replan through the
  // batch window and hide the defect entirely.
  it("retryNow() re-selects a degraded relay synchronously, and leaves no second replan queued", () => {
    const store = new EventStore();
    const connections = new Map<RelayUrl, FakeRelayConnection>();
    const clock = createFakeClock();
    const manager = new SubscriptionManager({
      store,
      routing: new RoutingTable(store),
      connect: (url) => {
        const relay = new FakeRelayConnection(url, { autoOpen: false });
        connections.set(url, relay);
        return relay;
      },
      fallbackRelays: [],
      scheduler: clock,
      random: () => 0.5,
    });

    const author = pubkeyFor(44_010);
    store.put(relayListFor(author, ["wss://dead/"]), "wss://indexer/");

    const plans: SectionPlan[] = [];
    manager.subscribe([{ kinds: [1], authors: [author] }], undefined, {
      onEvent: () => {},
      onRelayComplete: () => {},
      onRelayUnreachable: () => {},
      onPlanChanged: (plan) => plans.push(plan),
      onRelayRestarted: () => {},
    });

    connections.get("wss://dead/")?.die(); // failure 1
    clock.advance(1000);
    connections.get("wss://dead/")?.die(); // failure 2
    clock.advance(2000);
    connections.get("wss://dead/")?.die(); // failure 3
    clock.advance(4000);
    connections.get("wss://dead/")?.die(); // failure 4 -> degraded
    clock.advance(DEGRADED_REPLAN_BATCH_MS); // the exclusion replan

    expect(plans).toHaveLength(1);
    expect(plans[0].relays).toEqual([]); // dropped from the plan
    expect(plans[0].uncoveredAuthors).toBe(1);

    // The human hits "retry now". The pooled record for wss://dead/ is
    // already gone (the replan above dropped its last subscriber), so
    // `ConnectionPool.retryNow()`'s loop over live records cannot reach it
    // at all -- clearing the failure history is all the pool can do. Only a
    // re-selection can put the relay back in the plan.
    manager.retryNow();

    expect(manager.pool.degradedRelays).toEqual([]);
    expect(plans).toHaveLength(2);
    expect(plans[1].relays).toEqual(["wss://dead/"]);
    expect(plans[1].uncoveredAuthors).toBe(0);

    // Mutation: drop the pending-batch teardown from `retryNow()`. Task 1's
    // notification arms the batch timer on the way through
    // `pool.retryNow()`; leaving it armed costs a second, redundant replan
    // 200ms after every manual retry. Nothing else is scheduled at this
    // point (the reconnect timer died with the dropped record, the cooldown
    // timer was just cleared), so the count is exact.
    expect(clock.pendingCount).toBe(0);
  });

  // Mutation: remove the batching (call `this.#runReplan()` directly from
  // the pool.onDegradedChanged callback instead of arming/reusing a timer) -- this
  // is the ADR-0021 churn concern named explicitly in the final review: "if
  // 30 relays die together they all cross the threshold at nearly the same
  // jittered moment; one replan per crossing would be exactly the churn
  // ADR-0021 exists to prevent."
  it("coalesces several relays degrading within the same batch window into one replan", () => {
    const store = new EventStore();
    const connections = new Map<RelayUrl, FakeRelayConnection>();
    const clock = createFakeClock();
    const manager = new SubscriptionManager({
      store,
      routing: new RoutingTable(store),
      connect: (url) => {
        const relay = new FakeRelayConnection(url, { autoOpen: false });
        connections.set(url, relay);
        return relay;
      },
      fallbackRelays: [],
      scheduler: clock,
      random: () => 0.5,
    });

    const authorA = pubkeyFor(44_002);
    const authorB = pubkeyFor(44_003);
    store.put(relayListFor(authorA, ["wss://dead-a/"]), "wss://indexer/");
    store.put(relayListFor(authorB, ["wss://dead-b/"]), "wss://indexer/");

    const plans: SectionPlan[] = [];
    manager.subscribe(
      [{ kinds: [1], authors: [authorA, authorB] }],
      undefined,
      {
        onEvent: () => {},
        onRelayComplete: () => {},
        onRelayUnreachable: () => {},
        onPlanChanged: (plan) => plans.push(plan),
        onRelayRestarted: () => {},
      },
    );

    const urls: RelayUrl[] = ["wss://dead-a/", "wss://dead-b/"];
    // Both relays die and reconnect in lockstep, as a shared network outage
    // would produce -- driving both to their 4th (crossing) failure inside
    // the same batch window.
    for (const url of urls) connections.get(url)?.die(); // failure 1 each
    clock.advance(1000);
    for (const url of urls) connections.get(url)?.die(); // failure 2 each
    clock.advance(2000);
    for (const url of urls) connections.get(url)?.die(); // failure 3 each
    clock.advance(4000);
    for (const url of urls) connections.get(url)?.die(); // failure 4 each -> both cross

    expect([...manager.pool.degradedRelays].sort()).toEqual([
      "wss://dead-a/",
      "wss://dead-b/",
    ]);
    expect(plans).toHaveLength(0); // still batched

    clock.advance(DEGRADED_REPLAN_BATCH_MS);

    // One replan covers both crossings, not two.
    expect(plans).toHaveLength(1);
    expect(plans[0].relays).toEqual([]);
    expect(plans[0].uncoveredAuthors).toBe(2);
  });

  // Mutation: delete `this.#offDegraded()` from `dispose()` --
  // `degradedListenerCount` stays 1 instead of dropping to 0.
  // Mutation: delete the `#degradedReplanTimer` clear from `dispose()` --
  // `clock.pendingCount` stays > 0 instead of dropping to 0.
  it("dispose() cancels a pending replan batch and unsubscribes from the pool's onDegradedChanged notification", () => {
    const store = new EventStore();
    const connections = new Map<RelayUrl, FakeRelayConnection>();
    const clock = createFakeClock();
    const manager = new SubscriptionManager({
      store,
      routing: new RoutingTable(store),
      connect: (url) => {
        const relay = new FakeRelayConnection(url, { autoOpen: false });
        connections.set(url, relay);
        return relay;
      },
      fallbackRelays: [],
      scheduler: clock,
      random: () => 0.5,
    });

    expect(manager.pool.degradedListenerCount).toBe(1);

    const author = pubkeyFor(44_004);
    store.put(relayListFor(author, ["wss://dead/"]), "wss://indexer/");
    manager.subscribe(
      [{ kinds: [1], authors: [author] }],
      undefined,
      noopDelivery(),
    );

    connections.get("wss://dead/")?.die();
    clock.advance(1000);
    connections.get("wss://dead/")?.die();
    clock.advance(2000);
    connections.get("wss://dead/")?.die();
    clock.advance(4000);
    connections.get("wss://dead/")?.die(); // crosses -> arms the replan batch
    // (and a pending reconnect timer for wss://dead/ besides).

    expect(manager.pool.degradedRelays).toEqual(["wss://dead/"]);
    expect(clock.pendingCount).toBeGreaterThan(0); // sanity before dispose()

    manager.dispose();

    expect(manager.pool.degradedListenerCount).toBe(0);
    expect(clock.pendingCount).toBe(0);

    // Advancing well past the batch window and any backoff delay afterward
    // must not resurrect anything -- if either the timer or the
    // subscription had survived, this is where a leaked callback would run
    // against disposed internals.
    clock.advance(120_000);
    expect(clock.pendingCount).toBe(0);
  });
});

describe("ローカルフィルタ照合 (信頼境界)", () => {
  // 要求していないイベントを押し込むリレーを作る。明示リレー経路を使うのは、
  // ルーティングを介さずに「このリレーへこのフィルタを送った」を固定できるため。
  const setupExplicit = () => {
    const { relays, store, manager, delivery } = setup();
    const d = delivery();
    const handle = manager.subscribe(
      [{ kinds: [1], authors: [signed(1).pubkey] }],
      ["wss://liar/"],
      d,
    );
    const relay = relays.get("wss://liar/");
    if (!relay) throw new Error("relay was not opened");
    return { relay, store, manager, delivery: d, handle };
  };

  it("要求していないイベントはストアにも配信にも到達しない", () => {
    const { relay, store, manager, delivery } = setupExplicit();
    // 著者が違う (seed 2)。署名は本物なので schnorr では落ちない。
    const intruder = signed(2);

    relay.emitEvent(0, intruder);

    expect(store.get(intruder.id)).toBeUndefined();
    expect(delivery.onEvent).not.toHaveBeenCalled();
    expect(manager.unrequestedEventsByRelay.get("wss://liar/")).toBe(1);
  });

  it("要求したイベントは通り、カウンタは増えない", () => {
    const { relay, store, manager, delivery } = setupExplicit();
    const wanted = signed(1);

    relay.emitEvent(0, wanted);

    expect(store.get(wanted.id)).toBeDefined();
    expect(delivery.onEvent).toHaveBeenCalledWith(wanted.id, "wss://liar/");
    expect(manager.unrequestedEventsByRelay.get("wss://liar/")).toBeUndefined();
  });

  it("カウンタはリレーごとに分かれる", () => {
    const { relays, manager, delivery } = setup();
    manager.subscribe(
      [{ kinds: [1], authors: [signed(1).pubkey] }],
      ["wss://a/", "wss://b/"],
      delivery(),
    );
    const a = relays.get("wss://a/");
    const b = relays.get("wss://b/");
    if (!a || !b) throw new Error("relays were not opened");

    a.emitEvent(0, signed(2));
    a.emitEvent(0, signed(3));
    b.emitEvent(0, signed(4));

    expect(manager.unrequestedEventsByRelay.get("wss://a/")).toBe(2);
    expect(manager.unrequestedEventsByRelay.get("wss://b/")).toBe(1);
  });

  it("カウンタは単調増加で、外から書き換えられない", () => {
    const { relay, manager } = setupExplicit();
    relay.emitEvent(0, signed(2));

    const snapshot = manager.unrequestedEventsByRelay;
    (snapshot as Map<RelayUrl, number>).set("wss://liar/", 999);

    // アクセサはコピーを返すので、内部状態は汚染されない。
    expect(manager.unrequestedEventsByRelay.get("wss://liar/")).toBe(1);
  });

  it("同じリレー上の各購読が、それぞれ自分のフィルタで判定される", () => {
    // クロージャ捕捉が効いていることの主張。同じ接続の上に 2 セクション分の
    // REQ が並ぶ状況で、片方だけが要求している著者のイベントを *もう片方の*
    // 購読へ流す。`entry.opened` を実行時に引く実装や、フィルタを 1 つに
    // 混ぜてしまう実装だと、これが通ってしまう。
    //
    // 1 本目を close() してから 2 本目を張る形にしてはならない ——
    // エントリが 0 になるとプールが接続を落とし、再購読で `connect()` が
    // 二度呼ばれて setup() のガード (`connect called twice`) に当たる。
    const { relays, store, manager, delivery } = setup();
    const authorOne = signed(1).pubkey;
    const authorTwo = signed(2).pubkey;
    const dOne = delivery();
    const dTwo = delivery();

    manager.subscribe(
      [{ kinds: [1], authors: [authorOne] }],
      ["wss://x/"],
      dOne,
    );
    manager.subscribe(
      [{ kinds: [1], authors: [authorTwo] }],
      ["wss://x/"],
      dTwo,
    );

    const relay = relays.get("wss://x/");
    if (!relay) throw new Error("relay was not opened");
    expect(relay.subscriptions).toHaveLength(2);

    // 著者 1 のイベントを、著者 2 だけを要求している購読 (index 1) へ流す。
    const wantedByTheOtherSection = signed(1);
    relay.emitEvent(1, wantedByTheOtherSection);

    expect(dTwo.onEvent).not.toHaveBeenCalled();
    expect(store.get(wantedByTheOtherSection.id)).toBeUndefined();
    expect(manager.unrequestedEventsByRelay.get("wss://x/")).toBe(1);
  });

  it("フォロー中の著者の kind:10002 を push されても replan() は呼ばれない", () => {
    // 削除した引き金 (仕様 6 節) が復活していないことの主張。
    //
    // fix round 1, finding 1: この主張には 2 つの落とし穴があった。
    //
    // (1) 実スケジューラのまま同期的に判定すると非可反証だった —— 削除した
    // #scheduleReplan() は setTimeout 経由のデバウンスだったので、トリガーが
    // 復活していてもその場では何も起きず、assertion はどのみち通ってしまう。
    // 偽クロックを注入し、あり得るデバウンス幅 (かつての既定は 100ms) を
    // 十分に超えて時間を進めてから判定する。
    //
    // (2) セクションのフィルタを `{ kinds: [1], authors }` のままにすると、
    // 照合器 (このタスクの本体、恒久的に残る) 自体が kind:10002 をどのみち
    // 落とすので、引き金が復活していてもそこへ辿り着けず、この主張は別の
    // 理由でやはり非可反証になる。フィルタから kinds を外し、この著者からの
    // どんな kind でも照合器を通過するようにする —— この一点だけを許して、
    // それでも引き金が引かれないことを主張する。
    //
    // 「デバウンスタイマーが積まれないこと」ではなく `replan()` 自体を直接
    // スパイする —— 明示リレー購読では `replan()` が呼ばれても計画
    // (relays の集合) は変化しないため、`onPlanChanged` はここでは何も
    // 検出できない弱い信号になる (削除した Task 10 のテスト群がまさに
    // この理由で `replan()` を直接見ていた)。
    const clock = createFakeClock();
    const relays = new Map<RelayUrl, FakeRelayConnection>();
    const store = new EventStore();
    const manager = new SubscriptionManager({
      store,
      routing: new RoutingTable(store),
      connect: (url) => {
        const existing = relays.get(url);
        if (existing) throw new Error(`connect called twice for ${url}`);
        const relay = new FakeRelayConnection(url);
        relays.set(url, relay);
        return relay;
      },
      fallbackRelays: ["wss://fallback/"],
      scheduler: clock,
    });
    const replanSpy = vi.spyOn(manager, "replan");
    const author = signed(1).pubkey;
    manager.subscribe([{ authors: [author] }], ["wss://x/"], noopDelivery());
    const relay = relays.get("wss://x/");
    if (!relay) throw new Error("relay was not opened");

    // その著者本人の、まだ誰も知らない kind:10002。かつては再プランの引き金
    // だった。フィルタに kinds 指定が無いので照合器は通過する
    // (store.put() は "inserted" を返す)。
    const relayList = signed(1, {
      kind: 10002,
      created_at: 1_800_000_000,
      tags: [["r", "wss://newly-declared/", "write"]],
    });
    relay.emitEvent(0, relayList);
    // かつてのデバウンス窓 (既定 100ms) を大きく超えて進める。
    clock.advance(1000);

    // 前提条件そのものを可反証にする: もし照合器がこのフィクスチャを
    // 落としていたら (例えばフィルタの緩め方を今後変えた結果)、
    // 下の replanSpy の主張は「引き金が削除されているから」ではなく
    // 「イベントがそもそも store に届いていないから」空洞化して通ってしまう。
    // store に入っていることを直接見て、その逃げ道を塞ぐ。
    expect(store.get(relayList.id)).toBeDefined();
    expect(replanSpy).not.toHaveBeenCalled();
  });
});

describe("fetchOnce (仕様 5 節)", () => {
  /**
   * `FakeRelayConnection` 自身の `sub.closed` ガードは、一度閉じた購読への
   * 2 回目の `onEose`/`onClosed` を黙って握り潰す。「同じリレーが EOSE の
   * あと CLOSED を出しても二重に数えない」の主張をこれ越しに書くと、
   * `collect()` 自身の `settled` セットを消しても `FakeRelayConnection` の
   * ガードだけで assertion が通ってしまい、非可反証になる。
   * `bootstrap.test.ts` の `UnguardedConnection` と同じ理由でここにも同じ
   * 形の二重化なしコネクションを用意する —— close() 後も onEose/onClosed を
   * 好きなだけ呼べるので、防いでいるのが `collect()` 自身であることが
   * 直接主張できる。
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

    onOpen(): () => void {
      return () => {};
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

  it("全リレーが EOSE を報告したら解決する", async () => {
    const { relays, manager } = setup();
    let resolved = false;
    const pending = manager
      .fetchOnce([{ kinds: [1] }], { relays: ["wss://a/", "wss://b/"] })
      .then(() => {
        resolved = true;
      });

    relays.get("wss://a/")?.emitEose(0);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    // b がまだ何も言っていないので、まだ解決していないはず。
    expect(resolved).toBe(false);

    relays.get("wss://b/")?.emitEose(0);
    await pending;
    expect(resolved).toBe(true);
  });

  it("解決した時点で購読が閉じている", async () => {
    const { relays, manager } = setup();
    const pending = manager.fetchOnce([{ kinds: [1] }], {
      relays: ["wss://a/"],
    });

    relays.get("wss://a/")?.emitEose(0);
    await pending;

    expect(relays.get("wss://a/")?.subscriptions[0]?.closed).toBe(true);
  });

  it("1 本が CLOSED、もう 1 本が EOSE でも解決する", async () => {
    const { relays, manager } = setup();
    const pending = manager.fetchOnce([{ kinds: [1] }], {
      relays: ["wss://a/", "wss://b/"],
    });

    relays.get("wss://a/")?.emitClosed(0, "gone");
    relays.get("wss://b/")?.emitEose(0);

    await expect(pending).resolves.toBeUndefined();
  });

  it("同じリレーが EOSE のあと CLOSED を出しても二重に数えない", async () => {
    const store = new EventStore();
    const connections = new Map<RelayUrl, UnguardedConnection>();
    const manager = new SubscriptionManager({
      store,
      routing: new RoutingTable(store),
      connect: (url) => {
        const connection = new UnguardedConnection(url);
        connections.set(url, connection);
        return connection;
      },
    });

    let resolved = false;
    const pending = manager
      .fetchOnce([{ kinds: [1] }], { relays: ["wss://a/", "wss://b/"] })
      .then(() => {
        resolved = true;
      });

    // "a" を EOSE のあと (連続で) CLOSED でも settle させる。素朴な
    // カウントダウンなら、これだけで pending が 0 になり "b" を待たずに
    // 解決してしまう。
    connections.get("wss://a/")?.fireEose(0);
    connections.get("wss://a/")?.fireClosed(0, "extra close after eose");

    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(resolved).toBe(false);

    connections.get("wss://b/")?.fireEose(0);
    await pending;
    expect(resolved).toBe(true);
  });

  it("タイムアウトで解決し、未応答の購読も閉じる", async () => {
    vi.useFakeTimers();
    try {
      const { relays, manager } = setup();
      let resolved = false;
      const pending = manager
        .fetchOnce([{ kinds: [1] }], {
          relays: ["wss://silent/"],
          timeoutMs: 25,
        })
        .then(() => {
          resolved = true;
        });

      await vi.advanceTimersByTimeAsync(25);

      expect(resolved).toBe(true);
      await pending;
      expect(relays.get("wss://silent/")?.subscriptions[0]?.closed).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("届いたイベントが EventStore に入っている", async () => {
    const { relays, store, manager } = setup();
    const wanted = signed(1);
    const pending = manager.fetchOnce(
      [{ kinds: [1], authors: [wanted.pubkey] }],
      { relays: ["wss://a/"] },
    );

    relays.get("wss://a/")?.emitEvent(0, wanted);
    relays.get("wss://a/")?.emitEose(0);
    await pending;

    expect(store.get(wanted.id)).toBeDefined();
  });

  it("フィルタに一致しないイベントは store にも配信にも入らない (信頼境界)", async () => {
    const { relays, store, manager } = setup();
    const wanted = signed(1);
    const intruder = signed(2);
    const pending = manager.fetchOnce(
      [{ kinds: [1], authors: [wanted.pubkey] }],
      { relays: ["wss://a/"] },
    );

    relays.get("wss://a/")?.emitEvent(0, intruder);
    relays.get("wss://a/")?.emitEose(0);
    await pending;

    expect(store.get(intruder.id)).toBeUndefined();
    // Task 4 決定: fetchOnce は新しい受信経路なので matchesAnyFilter を
    // 継承する。捨てた件数は warmUpRouting のような専用の戻り値ではなく、
    // 既存の unrequestedEventsByRelay (仕様 5.1) へ合流させる。
    expect(manager.unrequestedEventsByRelay.get("wss://a/")).toBe(1);
  });

  it("options.relays を省略すると fallbackRelays を使う", async () => {
    const { relays, manager } = setup(); // setup() の fallbackRelays: ["wss://fallback/"]
    const pending = manager.fetchOnce([{ kinds: [1] }]);

    expect(relays.has("wss://fallback/")).toBe(true);
    relays.get("wss://fallback/")?.emitEose(0);
    await pending;
  });

  it("予算が埋まっていれば reserved 迂回を使わず、素直に何も取れない", async () => {
    const store = new EventStore();
    const connections = new Map<RelayUrl, FakeRelayConnection>();
    const manager = new SubscriptionManager({
      store,
      routing: new RoutingTable(store),
      connect: (url) => {
        const relay = new FakeRelayConnection(url);
        connections.set(url, relay);
        return relay;
      },
      maxConnections: 1,
    });
    // 既存の 1 本の購読で、この manager の予算 (1 接続) を使い切る。
    manager.subscribe([{ kinds: [1] }], ["wss://busy/"], noopDelivery());
    expect(manager.connectionCount).toBe(1);

    // fetchOnce が `{ reserved: true }` を使っていれば、ここで予算を無視して
    // 新しい接続を開いてしまうはず。使っていなければ pool.subscribe() が
    // undefined を返し、この URL への接続そのものが起きない。
    await manager.fetchOnce([{ kinds: [1] }], { relays: ["wss://new/"] });

    expect(connections.has("wss://new/")).toBe(false);
    expect(manager.connectionCount).toBe(1);
  });
});
