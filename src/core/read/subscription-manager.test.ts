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
  type SectionPlan,
  SubscriptionManager,
  type SubscriptionManagerOptions,
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
});

type CreateManagerOptions = Partial<
  Pick<
    SubscriptionManagerOptions,
    "maxConnections" | "redundancy" | "fallbackRelays"
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
  const base = createManager(managerOptions);
  const { delivery, plans, handle } = subscribeWithPlans(base.manager, [
    { kinds: [1], authors },
  ]);
  return { ...base, delivery, plans, handle };
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

  // Self-review regression test (not part of the brief's verbatim set):
  // if connect() throws for one relay in a multi-relay subscribe, the
  // connections already acquired for earlier relays in the same call must
  // not leak — no SectionHandle is ever returned to release them otherwise.
  it("closes already-acquired connections when a later relay fails to connect", () => {
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

    expect(() =>
      manager.subscribe([{ kinds: [1] }], ["wss://ok/", "wss://broken/"], {
        onEvent: vi.fn(),
        onRelayComplete: vi.fn(),
        onRelayUnreachable: vi.fn(),
        onPlanChanged: vi.fn(),
      }),
    ).toThrow("boom");

    expect(opened).toHaveLength(1);
    expect(opened[0].closed).toBe(true);
    expect(manager.connectionCount).toBe(0);
  });

  // Self-review regression test (not part of the brief's verbatim set):
  // #acquire() bumps the pool refCount *before* connection.subscribe() runs.
  // If subscribe() itself throws (as opposed to connect() throwing), that
  // url's acquisition must still be released even though it never made it
  // into `opened`.
  it("releases an already-acquired connection when subscribe() itself throws", () => {
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

    expect(() =>
      manager.subscribe([{ kinds: [1] }], ["wss://ok/", "wss://broken/"], {
        onEvent: vi.fn(),
        onRelayComplete: vi.fn(),
        onRelayUnreachable: vi.fn(),
        onPlanChanged: vi.fn(),
      }),
    ).toThrow("boom");

    expect(manager.connectionCount).toBe(0);
    expect(closedUrls).toContain("wss://broken/");
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
    });

    manager.dispose();

    manager.subscribe([{ kinds: [1] }], ["wss://x/"], {
      onEvent: vi.fn(),
      onRelayComplete: vi.fn(),
      onRelayUnreachable: vi.fn(),
      onPlanChanged: vi.fn(),
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

  it("never drops an explicitly requested relay for budget reasons", () => {
    const { manager, store, connections } = createManager({
      maxConnections: 1,
    });
    manager.subscribe([{ kinds: [1] }], ["wss://named/"], noopDelivery());
    manager.subscribe(
      [{ kinds: [1], authors: authorsWithRelays(store, 200, 205) }],
      undefined,
      noopDelivery(),
    );

    expect([...connections.keys()]).toContain("wss://named/");
  });
});
