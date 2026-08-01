import { schnorr } from "@noble/curves/secp256k1.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import { describe, expect, it, vi } from "vitest";
import { type NostrEvent, computeEventId } from "../nostr/event";
import { FakeRelayConnection } from "../relay/fake-relay-connection";
import type { RelayFilter, RelayUrl } from "../relay/relay-connection";
import { EventStore } from "./event-store";
import { RoutingTable } from "./routing-table";
import {
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

// Like relayListFor, but an ordinary kind:1 note -- for pinning that the
// re-plan-on-kind:10002 hook (Task 10) does not fire for every event that
// flows through the manager, only the routing-relevant kind.
const noteBy = (pubkey: string): NostrEvent => {
  const seed = seedByPubkey.get(pubkey);
  if (seed === undefined) {
    throw new Error(
      `noteBy: ${pubkey} was not minted via pubkeyFor, cannot sign for it`,
    );
  }
  return signed(seed, { kind: 1 });
};

// Task 10's burst test needs many distinct authors without colliding with
// seeds used elsewhere in this file; offset well clear of every other range.
const authorAt = (i: number): string => pubkeyFor(90_000 + i);

// Delivers `event` on `connection`'s current live subscription. The manager
// re-opens/restarts subscriptions across replans, so "subscription 0" isn't
// always the right index once a section has already been re-planned once --
// this picks the most recently opened one that hasn't been closed instead of
// hard-coding an index.
const emitEvent = (
  connection: FakeRelayConnection | undefined,
  event: NostrEvent,
): void => {
  if (!connection) throw new Error("test setup: connection missing");
  let index = -1;
  for (let i = connection.subscriptions.length - 1; i >= 0; i--) {
    if (!connection.subscriptions[i].closed) {
      index = i;
      break;
    }
  }
  if (index === -1) {
    throw new Error("test setup: connection has no active subscription");
  }
  connection.emitEvent(index, event);
};

const noopDelivery = (): SectionDelivery => ({
  onEvent: () => {},
  onRelayComplete: () => {},
  onRelayUnreachable: () => {},
  onPlanChanged: () => {},
  onRelayRestarted: () => {},
});

// Fix round 1, Important 2: minimal local fake clock for the retryNow() /
// scheduler-passthrough tests below. Deliberately smaller than
// connection-pool.test.ts's FakeClock (no clearTimeout spy, no same-tick
// reentrancy hardening needed here) -- this file owns its own fixture
// rather than importing another test file's.
type TestScheduler = NonNullable<SubscriptionManagerOptions["scheduler"]>;

const createFakeClock = (): TestScheduler & { advance(ms: number): void } => {
  let now = 0;
  let nextId = 1;
  const timers = new Map<number, { at: number; callback: () => void }>();
  return {
    setTimeout: (callback, delayMs) => {
      const id = nextId++;
      timers.set(id, { at: now + delayMs, callback });
      return id as unknown as ReturnType<typeof setTimeout>;
    },
    clearTimeout: (handle) => {
      timers.delete(handle as unknown as number);
    },
    advance(ms) {
      now += ms;
      const due = [...timers.entries()]
        .filter(([, t]) => t.at <= now)
        .sort((a, b) => a[1].at - b[1].at);
      for (const [id, t] of due) {
        if (!timers.has(id)) continue;
        timers.delete(id);
        t.callback();
      }
    },
  };
};

type CreateManagerOptions = Partial<
  Pick<
    SubscriptionManagerOptions,
    | "maxConnections"
    | "redundancy"
    | "fallbackRelays"
    | "scheduler"
    | "replanDebounceMs"
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
    replanDebounceMs: options.replanDebounceMs,
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

  // ---------------------------------------------------------------------
  // Task 10: closes the ADR-0016 loop. A section provisionally routed to
  // the fallback relays for an author whose kind:10002 isn't known yet must
  // be re-planned once that relay list actually arrives -- and warm-up
  // delivers it as a burst (one query fetches every followee's kind:10002
  // at once), so the re-plan has to be debounced through the injected
  // scheduler rather than firing per event.
  // ---------------------------------------------------------------------
  it("re-plans after a kind:10002 arrives", () => {
    const AUTHOR = pubkeyFor(80_001);
    const { connections, plans, clock } = createManagerWithSection([AUTHOR]);
    expect(plans.at(-1)?.relays).toEqual(["wss://fallback/"]);

    // The fallback relay is the one that ends up delivering the author's own
    // kind:10002 (this is exactly the provisional-fallback path ADR-0016
    // describes).
    emitEvent(
      connections.get("wss://fallback/"),
      relayListFor(AUTHOR, ["wss://author-write/"]),
    );
    clock.advance(100);

    expect(plans.at(-1)?.relays).toEqual(["wss://author-write/"]);
  });

  // Brief round-trip note: the brief's version of this test measured the
  // burst's effect through `plans.length` (onPlanChanged call count), the
  // same signal the first test above uses. That doesn't actually pin
  // debouncing: none of these 50 authors is a member of this section's own
  // filter, so its plan never changes regardless of whether the burst
  // triggers 1 replan() or 50 -- planEqual() suppresses onPlanChanged for
  // every one of them either way, making the two cases indistinguishable
  // through that signal. Spying on `replan()` itself observes the mechanism
  // directly instead.
  it("debounces a burst of relay lists into one re-plan", () => {
    const AUTHOR = pubkeyFor(80_002);
    const { manager, connections, clock } = createManagerWithSection([AUTHOR]);
    const replanSpy = vi.spyOn(manager, "replan");

    for (let i = 0; i < 50; i += 1) {
      emitEvent(
        connections.get("wss://fallback/"),
        relayListFor(authorAt(i), [`wss://w${i}/`]),
      );
    }
    expect(replanSpy).not.toHaveBeenCalled();

    clock.advance(100);

    // Warm-up is a burst of kind:10002s. It must not trigger 50 re-plans.
    expect(replanSpy).toHaveBeenCalledTimes(1);
  });

  // Fix round 1, Important 1: this used to assert on `plans.length`, the same
  // signal proven insensitive by the burst test above -- and for a subtler
  // reason than the burst test's "wrong author". A rejected event is never
  // actually indexed by EventStore.put() (verifyEvent() failed, so nothing
  // was written), so even a *completely unguarded* manager that called
  // scheduleReplan() unconditionally would trigger a replan() that finds the
  // routing table unchanged and therefore never fires onPlanChanged. The
  // signal can't tell "guarded, never asked" from "unguarded, asked and
  // found nothing new" apart. Spying on replan() observes whether the ask
  // happened at all, independent of what a downstream replan() finds.
  it("does not re-plan for ordinary events", () => {
    const AUTHOR = pubkeyFor(80_003);
    const { manager, connections, clock } = createManagerWithSection([AUTHOR]);
    const replanSpy = vi.spyOn(manager, "replan");

    emitEvent(connections.get("wss://fallback/"), noteBy(AUTHOR));
    clock.advance(100);

    expect(replanSpy).not.toHaveBeenCalled();
  });

  it("does not re-plan for a kind:10002 EventStore rejects (bad signature)", () => {
    const AUTHOR = pubkeyFor(80_004);
    const { manager, connections, clock } = createManagerWithSection([AUTHOR]);
    const replanSpy = vi.spyOn(manager, "replan");

    const forged = {
      ...relayListFor(AUTHOR, ["wss://author-write/"]),
      content: "tampered",
    };
    emitEvent(connections.get("wss://fallback/"), forged);
    clock.advance(100);

    // A relay must not be able to force a re-plan by pushing a malformed or
    // unverifiable kind:10002 -- store.put() returning "rejected" must not
    // reach the debounce hook at all (cheap DoS otherwise).
    expect(replanSpy).not.toHaveBeenCalled();
  });

  // Fix round 1, Important 2: the hook used to gate on `result !== "rejected"`,
  // which also let a "duplicate" result through. EventStore.put() returns
  // "duplicate" for an already-stored id without touching #indexReplaceable
  // -- the routing table provably cannot have changed -- so an already
  // -connected relay that keeps re-delivering a kind:10002 the client already
  // has could force a full global greedy re-selection every debounce window,
  // indefinitely, for zero new information. Gating on `=== "inserted"`
  // closes that: only a genuine insert (a first sighting, or a newer
  // replaceable version with a different id) can change routing.
  it("schedules a re-plan for the first delivery of a kind:10002, but not for a duplicate of the same event", () => {
    const AUTHOR = pubkeyFor(80_006);
    const { manager, connections, clock } = createManagerWithSection([AUTHOR]);
    const replanSpy = vi.spyOn(manager, "replan");
    const relayList = relayListFor(AUTHOR, ["wss://author-write/"]);

    emitEvent(connections.get("wss://fallback/"), relayList);
    clock.advance(100);
    expect(replanSpy).toHaveBeenCalledTimes(1);

    // The exact same event (same id) arrives again -- now via the relay the
    // author itself just got routed to, the ordinary way a second copy of an
    // already-known kind:10002 would show up. EventStore.put() returns
    // "duplicate" here, not "inserted".
    emitEvent(connections.get("wss://author-write/"), relayList);
    clock.advance(100);

    expect(replanSpy).toHaveBeenCalledTimes(1);
  });

  it("cancels a pending debounced re-plan on dispose()", () => {
    const AUTHOR = pubkeyFor(80_005);
    const { manager, connections, plans, clock } = createManagerWithSection([
      AUTHOR,
    ]);
    const before = plans.length;

    emitEvent(
      connections.get("wss://fallback/"),
      relayListFor(AUTHOR, ["wss://author-write/"]),
    );
    manager.dispose();

    expect(() => clock.advance(100)).not.toThrow();
    expect(plans.length).toBe(before);
  });
});
