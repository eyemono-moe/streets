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

// replan() pools demand across every registered section, so these tests need
// to mint many distinct authors (each with its own kind:10002) and inspect a
// manager's global connection set rather than a single relay's subscriptions.
// `seedByPubkey` lets `relayListFor` take a pubkey while still being able to
// sign for it, by remembering which seed produced that pubkey.
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

  // The explicit-relays branch handed the very same `filters` array instance
  // to every relay via perRelay.set(url, filters). The routed path
  // (query-plan.ts) shallow-copies per relay specifically to prevent this
  // kind of cross-relay aliasing; the bypass path had reintroduced the
  // hazard fixed one layer down.
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

  // Silently dropping a place we couldn't check is forbidden: an explicit
  // relay list containing a URL that fails normalizeRelayUrl must not just
  // vanish — that would be indistinguishable from "checked everywhere, found
  // nothing". Report it through onRelayUnreachable so it shows up as
  // incomplete, same as a relay that connected and then closed.
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

  // ConnectionPool absorbs connect() failures and reports them through
  // onClosed -> onRelayUnreachable instead of throwing -- SectionReader.stop()
  // doesn't try/catch handle.close(), so a throw there would permanently
  // wedge #started. The already-good connection must simply stay open;
  // nothing rolls back.
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
    // entry is retained (for a later reconnect) with a null
    // connection, which `size` deliberately excludes.
    expect(manager.connectionCount).toBe(1);
    expect(unreachable).toEqual(["wss://broken/"]);
  });

  // Here the failure point is connection.subscribe() throwing rather than
  // connect() -- a different step of the pool's algorithm, also absorbed
  // rather than propagated.
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

  // PooledSubscription.close() (and therefore SectionHandle.close())
  // must be total. Reproduces the chain: handle.close()
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

  // connectionCount alone cannot prove a budget was
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

  // dispose() abandons outstanding SectionHandles instead of
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

  // FakeRelayConnection.close() synchronously delivers onClosed to every
  // live subscription, reaching #handlersFor's `if (!entry.closed)` guard --
  // if dispose() never sets entry.closed, this fires onRelayUnreachable
  // into a callback whose SectionReader already had stop() called.
  it("marks every entry closed before pool.dispose(), so the pool's synchronous close-delivery cannot reach a delivery callback after dispose()", () => {
    const { manager, delivery } = setup();
    const d = delivery();
    manager.subscribe([{ kinds: [1] }], ["wss://one/"], d);

    manager.dispose();

    expect(d.onRelayUnreachable).not.toHaveBeenCalled();
  });

  // A duplicate delivery must still reach every section, and a forged event
  // reusing a known id must never overwrite the verified body in EventStore.
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

  // The budget is global, so two sections that each look
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
  // section's phase back from settled to streaming on every replan() call.
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

  // Explicit relays bypass author routing, but not the connection budget --
  // `pinned` is truncated at `budget` like everything else. What's worth
  // testing is that an explicit relay wins the contest for a scarce slot
  // over a routed one.
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

  // pinned is priority, not exemption. A section naming more
  // relays than the whole app can afford still gets truncated at the
  // budget -- the surviving relays are reported unreachable through
  // onRelayUnreachable (there are no authors behind an explicit
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
    // The refused relay stays in plan.relays so SectionReader
    // keeps a record of it (and its unreachable flag) instead of losing it
    // at the next plan change.
    expect(handle.initialPlan.relays).toEqual([
      "wss://e1/",
      "wss://e2/",
      "wss://e3/",
    ]);
  });

  // planQuery broadcasts an author with no known kind:10002 to every
  // fallback relay, so one unroutable author in a section could burn the
  // app's entire budget on a single fallback broadcast if left unchecked.
  // The pool caps this exactly like the routed and explicit paths.
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

  // If the diff in #applyEntryDiff were keyed on relay URL alone, a relay
  // that survives both plans would keep its stale filters forever even when
  // the set of authors routed to it changed — the section would report
  // settled while an author it should be watching was subscribed nowhere at
  // all.
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

  // #planEqual prevents onPlanChanged from firing when a replan() produces
  // the exact same observable plan.
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

  // planEqual is exported so its order-insensitivity can be pinned directly
  // -- a genuine "same set, different order" case is effectively impossible
  // to construct through the public API, since perRelay's key order tracks
  // filter/tag order, never selectRelays' pick order.
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

  // onPlanChanged must never fire synchronously from inside the subscribe()
  // call that registers the section — the caller doesn't hold the handle
  // yet. subscribeWithPlans' `plans` array (seeded manually with
  // initialPlan) can't distinguish "no spurious fire" from "a fire happened
  // but plans already had the right value" — this asserts on the raw
  // callback directly instead.
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

  // A section registered reentrantly (from inside a delivery callback fired
  // during an in-progress replan) must not be visited by the still-running
  // outer pass using its stale, pre-registration selection. `planB` mirrors
  // how a real caller combines `initialPlan` with `onPlanChanged`, since
  // which mechanism delivers the plan shouldn't matter.
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
          // A relay that answers instantly: EOSE fires before
          // manager.subscribe() returns, via onEose (not onClosed) so this
          // stays isolated from the reentrant-onClosed test below.
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

  // connection.subscribe() on an already-dead pooled connection fires
  // onClosed synchronously. If a delivery callback reacts by calling
  // replan(), the reentrant call must not re-run the "add" loop for the
  // same entry while the original add is in flight -- otherwise it
  // double-acquires the url and, unbounded, recurses without limit.
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
          // Always dead: every subscribe() attempt reports closed synchronously.
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
        // Deliberately unconditional (no "only once" guard) so a
        // regression would still stack-overflow.
        onRelayUnreachable: () => manager.replan(),
        onPlanChanged: () => {},
        onRelayRestarted: () => {},
      }),
    ).not.toThrow();

    expect(subscribeCallCount).toBe(1);
    expect(manager.connectionCount).toBe(1);
  });

  // A relay *refused for budget* (pool.subscribe() returns undefined, not a
  // dead connection) never enters entry.opened, so every pass re-attempts,
  // re-refuses, and -- with an unconditional onRelayUnreachable -> replan()
  // callback -- sets #dirty every time, a synchronous infinite loop. Needs
  // two relays under a budget of 1 so one is accepted, one refused always.
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
        // every pass and unconditionally triggers a replan.
        onRelayUnreachable: () => {
          unreachableCalls += 1;
          manager.replan();
        },
        onPlanChanged: () => {},
        onRelayRestarted: () => {},
      }),
    ).not.toThrow();

    // Reported exactly once (the transition into "refused"), not once per
    // pass (infinite loop) and not zero times (hides the incompleteness).
    expect(unreachableCalls).toBe(1);
    expect(manager.connectionCount).toBe(1);
  });

  // The transition-only guard above stops that non-convergent case, but the
  // do/while loop must also stay bounded when convergence fails for a
  // different reason -- a callback that keeps manufacturing new demand.
  // Every refusal spawns a brand-new section with its own explicit relay
  // (also immediately refused), so convergence never happens by construction.
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

    // Each spawned section's onRelayUnreachable spawns another, growing
    // demand forever since the filler still owns the only slot.
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

  // pool.subscribe() can fire handlers.onClosed *synchronously*, reaching
  // onRelayUnreachable -> an arbitrary delivery callback. If that callback
  // closes the section, #close() clears entry.opened *before*
  // pool.subscribe() returns -- the "new" branch would then repopulate a
  // closed entry with a live PooledSubscription nothing ever closes.
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

    // subscribe() must return a handle before the failing relay enters the
    // picture -- a failure *during* subscribe() is a different, already
    // covered scenario.
    const handle = manager.subscribe(
      [{ kinds: [1], authors: [A] }],
      undefined,
      {
        onEvent: () => {},
        onRelayComplete: () => {},
        // Safe to reference `handle` here despite the closure predating the
        // `const` -- it only runs later, from replan() below.
        onRelayUnreachable: () => handle.close(),
        onPlanChanged: () => {},
        onRelayRestarted: () => {},
      },
    );
    expect(handle.initialPlan.relays).toEqual(["wss://fallback/"]);

    // A's kind:10002 now resolves to wss://bad/ -- a *new* relay (not an
    // in-place restart), whose subscribe() fails synchronously.
    store.put(relayListFor(A, ["wss://bad/"]), "wss://indexer/");
    expect(() => manager.replan()).not.toThrow();

    // Without the entry.closed guard this would repopulate entry.opened
    // after #close() cleared it, leaking a connection nothing ever closes.
    expect(manager.connectionCount).toBe(0);
    expect(closeCalls).toBeGreaterThan(0);
  });

  // The same hole exists after onRelayRestarted, one branch down --
  // it fires before the in-place restart's own pool.subscribe() call, so a
  // delivery callback that closes the section there has the same window
  // to leak a subscription into a cleared entry.opened.
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
          // Safe: runs later, from replan() below.
          handle.close();
        },
      },
    );

    // B's kind:10002 declares the SAME relay A already uses, so the author
    // bucket routed to wss://x/ changes from [A] to [A, B], triggering
    // an in-place restart for that URL.
    store.put(relayListFor(B, ["wss://x/"]), "wss://indexer/");
    expect(() => manager.replan()).not.toThrow();

    expect(restarted).toBe(true);
    // Nothing should still be holding wss://x/ open on the section's behalf.
    expect(manager.connectionCount).toBe(0);
  });

  // Pins the "same relay kept, filters changed" branch when the re-subscribe
  // call itself fails: must converge to exactly one onRelayUnreachable (via
  // the pool's synchronous onClosed, not a second direct call), leave no
  // leaked duplicate registration, leave siblings untouched, and stay
  // close()-total afterward.
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
            // First call (initial open) succeeds; the second (the in-place
            // restart triggered by B joining A) throws.
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

    // B's kind:10002 arrives declaring the SAME relay A already uses, so the
    // author bucket routed to it changes -- the in-place restart's
    // subscribe() call is the one wired to throw.
    store.put(relayListFor(B, ["wss://x/"]), "wss://indexer/");
    expect(() => manager.replan()).not.toThrow();

    expect(xSubscribeCalls).toBe(2);
    expect(xConnectCalls).toBe(1); // no second connect() — same connection
    // Exactly one report, via the pool's synchronous onClosed path, not
    // doubled by a separate direct call from the manager.
    expect(unreachable).toEqual(["wss://x/"]);
    // Only the REQ failed, not the socket, so wss://x/ is still live.
    expect(manager.connectionCount).toBe(2);

    // A further replan() must not re-attempt or re-report -- entry.opened
    // already reflects the last-attempted filters, so the diff sees
    // "unchanged".
    manager.replan();
    expect(xSubscribeCalls).toBe(2);
    expect(unreachable).toEqual(["wss://x/"]);

    // close() must still be total and tear the connection down exactly once.
    expect(() => handle.close()).not.toThrow();
    expect(xConnectionCloseCalls).toBe(1);
    expect(manager.connectionCount).toBe(0);
  });

  // #replanOnce iterates every entry in one bare for loop. If one entry's
  // callback throws, entries processed later in that pass must still get
  // their updated plan.
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
    // one pass visits A (throws) then B.
    store.put(relayListFor(A, ["wss://a-write/"]), "wss://indexer/");
    store.put(relayListFor(B, ["wss://b-write/"]), "wss://indexer/");

    expect(() => manager.replan()).not.toThrow();

    expect(plansB.at(-1)?.relays).toEqual(["wss://b-write/"]);
  });

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

    // If `scheduler` weren't reaching the pool, this fake clock advance
    // would do nothing and connectCalls would stay at 1.
    clock.advance(999);
    expect(connectCalls).toHaveLength(1);
    // First backoff is exactly 1000 * (0.5 + 0.5), deterministic only
    // because `random` also reached the pool.
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
        // autoOpen: false -- 恒久的に到達不能なリレーを再現する。
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

    expect(handle.initialPlan.relays).toEqual(["wss://dead/"]);

    // DEGRADED_AFTER_FAILURES (4) consecutive failures, advancing the clock
    // through each backoff so the pool actually retries and re-fails.
    connections.get("wss://dead/")?.die(); // failure 1
    clock.advance(1000);
    connections.get("wss://dead/")?.die(); // failure 2
    clock.advance(2000);
    connections.get("wss://dead/")?.die(); // failure 3
    clock.advance(4000);
    connections.get("wss://dead/")?.die(); // failure 4 -> degraded

    expect(manager.pool.degradedRelays).toEqual(["wss://dead/"]);

    // Connection death does not itself trigger replan() -- callers own that.
    manager.replan();

    expect(plans.at(-1)?.relays).toEqual([]);
    expect(plans.at(-1)?.uncoveredAuthors).toBe(1);
  });
});

// The test above calls `manager.replan()` by hand, proving the pure-function
// wiring but not that the real app ever calls it. These tests never call it
// by hand -- the constructor's `onDegradedChanged` wiring plus the batching
// must produce the replan on their own.
describe("SubscriptionManager: automatic replan on a degraded transition", () => {
  // If the constructor never wired `onDegradedChanged`, this fails not with
  // a clearly-wrong number but with `plans` staying empty forever.
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
        // autoOpen: false -- socket objects get created but never prove they opened.
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

    // Same DEGRADED_AFTER_FAILURES (4) backoff sequence, but no
    // manager.replan() call anywhere below.
    connections.get("wss://dead/")?.die(); // failure 1
    clock.advance(1000);
    connections.get("wss://dead/")?.die(); // failure 2
    clock.advance(2000);
    connections.get("wss://dead/")?.die(); // failure 3
    clock.advance(4000);
    connections.get("wss://dead/")?.die(); // failure 4 -> crosses into degraded

    // The crossing notification is batched -- nothing fired synchronously yet.
    expect(manager.pool.degradedRelays).toEqual(["wss://dead/"]);
    expect(plans).toHaveLength(0);

    // Advance past the batch window -> exactly one replan fires.
    clock.advance(DEGRADED_REPLAN_BATCH_MS);

    expect(plans).toHaveLength(1);
    expect(plans[0].relays).toEqual([]);
    expect(plans[0].uncoveredAuthors).toBe(1);

    // The replan dropped the last subscriber, which cancels its pending
    // reconnect timer too -- otherwise advancing past any backoff would
    // produce more connect() calls.
    const callsSoFar = connectCalls.filter((u) => u === "wss://dead/").length;
    clock.advance(120_000);
    expect(connectCalls.filter((u) => u === "wss://dead/").length).toBe(
      callsSoFar,
    );
  });

  // Catches reverting retryNow() to a bare pool.retryNow(): failure history
  // clears either way, but without a re-selection the relay stays out of
  // the plan. No clock.advance() here -- advancing would replan through
  // the batch window and hide the defect.
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

    // The pooled record for wss://dead/ is already gone, so
    // `retryNow()`'s loop over live records can't reach it -- only a
    // re-selection can put the relay back.
    manager.retryNow();

    expect(manager.pool.degradedRelays).toEqual([]);
    expect(plans).toHaveLength(2);
    expect(plans[1].relays).toEqual(["wss://dead/"]);
    expect(plans[1].uncoveredAuthors).toBe(0);

    // Catches dropping the pending-batch teardown from retryNow(): leaving
    // it armed costs a second, redundant replan 200ms later.
    expect(clock.pendingCount).toBe(0);
  });

  // Catches removing the batching (calling #runReplan() directly from the
  // callback) -- if 30 relays die together, one replan per crossing would
  // be exactly the churn batching exists to prevent.
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
    // Both relays die in lockstep, driving both to their 4th (crossing)
    // failure inside the same batch window.
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

  // Catches dropping `#offDegraded()` from dispose() (listenerCount stays 1)
  // or the timer clear (pendingCount stays > 0).
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

    expect(manager.pool.degradedRelays).toEqual(["wss://dead/"]);
    expect(clock.pendingCount).toBeGreaterThan(0); // sanity before dispose()

    manager.dispose();

    expect(manager.pool.degradedListenerCount).toBe(0);
    expect(clock.pendingCount).toBe(0);

    // If either the timer or the subscription survived, a leaked callback
    // would run against disposed internals here.
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
    // クロージャ捕捉の主張。`entry.opened` を実行時に引く実装や、フィルタを
    // 1 つに混ぜる実装だと、片方の著者のイベントがもう片方の購読へ漏れる。
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
    // 偽クロックで十分に時間を進めてから判定する —— 実スケジューラだと
    // デバウンス由来の遅延で判定が非可反証になるため。フィルタから kinds を
    // 外すのは、`{ kinds: [1] }` のままだと照合器自体が kind:10002 を落とし、
    // 別の理由で非可反証になってしまうため。`replan()` 自体を直接スパイする
    // のは、明示リレー購読では計画が変化せず `onPlanChanged` が弱い信号に
    // なるため。
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

    // フィルタに kinds 指定が無いので照合器は通過する。
    const relayList = signed(1, {
      kind: 10002,
      created_at: 1_800_000_000,
      tags: [["r", "wss://newly-declared/", "write"]],
    });
    relay.emitEvent(0, relayList);
    clock.advance(1000);

    // 照合器がこのフィクスチャを落としていたら replanSpy の主張が空洞化
    // するので、store に入っていることを直接見て逃げ道を塞ぐ。
    expect(store.get(relayList.id)).toBeDefined();
    expect(replanSpy).not.toHaveBeenCalled();
  });
});

describe("fetchOnce", () => {
  /**
   * `FakeRelayConnection` の `sub.closed` ガードは、閉じた購読への 2 回目の
   * `onEose`/`onClosed` を黙って握り潰す。それ越しに二重カウント防止を主張
   * すると `collect()` 自身の `settled` セットを消しても通ってしまうので、
   * close() 後も呼べる二重化なしコネクションを用意する。
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
    // 捨てた件数は専用の戻り値ではなく既存の unrequestedEventsByRelay へ合流させる。
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
