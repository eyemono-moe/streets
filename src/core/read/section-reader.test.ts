import { schnorr } from "@noble/curves/secp256k1.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import { describe, expect, it, vi } from "vitest";
import { type NostrEvent, computeEventId } from "../nostr/event";
import { FakeRelayConnection } from "../relay/fake-relay-connection";
import { EventStore } from "./event-store";
import { RoutingTable } from "./routing-table";
import { SectionReader } from "./section-reader";
import { MAX_ITEMS_PER_SECTION } from "./source";
import { SubscriptionManager } from "./subscription-manager";

// Task 1/4 と同じく、その場で署名して自己整合的なイベントを作る。実 EventStore
// は verifyEvent を通すため、PassThroughStore と違って本物の署名が要る。
const secretKey = Uint8Array.from({ length: 32 }, (_, i) => i + 1);
const pubkey = bytesToHex(schnorr.getPublicKey(secretKey));

const signedEvent = (content: string, createdAt: number): NostrEvent => {
  const unsigned = {
    pubkey,
    created_at: createdAt,
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

// 署名検証を通さずに SectionReader だけを試すため、EventStore を差し替える。
// SectionReader は put() 後に get() で正本を取り直すので、real EventStore と
// 同じく put() した内容を get() で返せる必要がある。
class PassThroughStore extends EventStore {
  readonly #seen = new Map<string, NostrEvent>();
  override put(event: NostrEvent): "inserted" | "duplicate" | "rejected" {
    if (this.#seen.has(event.id)) return "duplicate";
    this.#seen.set(event.id, event);
    return "inserted";
  }
  override get(id: string): NostrEvent | undefined {
    return this.#seen.get(id);
  }
}

const event = (id: string, createdAt: number): NostrEvent => ({
  id,
  pubkey: "alice",
  created_at: createdAt,
  kind: 1,
  tags: [],
  content: id,
  sig: "sig",
});

const setup = (relayUrls = ["wss://a/"]) => {
  const relays = new Map<string, FakeRelayConnection>();
  const store = new PassThroughStore();
  const manager = new SubscriptionManager({
    store,
    routing: new RoutingTable(store),
    connect: (url) => {
      const relay = new FakeRelayConnection(url);
      relays.set(url, relay);
      return relay;
    },
    fallbackRelays: ["wss://fallback/"],
  });
  const reader = new SectionReader({
    source: { type: "nostr", filters: [{ kinds: [1] }], relays: relayUrls },
    order: "created-at-desc",
    store,
    manager,
  });
  return {
    relays,
    store,
    manager,
    reader,
    relay: () => relays.get(relayUrls[0]),
  };
};

describe("SectionReader", () => {
  it("starts in the initial phase before anything arrives", () => {
    const { reader } = setup();
    reader.start();

    expect(reader.status.phase).toBe("initial");
    expect(reader.items).toEqual([]);
  });

  it("reports initial phase with no incomplete block before start() is ever called", () => {
    const { reader } = setup();

    expect(reader.status.phase).toBe("initial");
    expect(reader.status.incomplete).toBeUndefined();
    expect(reader.items).toEqual([]);
  });

  it("moves to streaming once the first event arrives", () => {
    const { relay, reader } = setup();
    reader.start();

    relay()?.emitEvent(0, event("first", 100));

    expect(reader.status.phase).toBe("streaming");
    expect(reader.items.map((e) => e.id)).toEqual(["first"]);
  });

  it("settles when every relay has sent eose", () => {
    const { relay, reader } = setup();
    reader.start();

    relay()?.emitEvent(0, event("first", 100));
    relay()?.emitEose(0);

    expect(reader.status.phase).toBe("settled");
  });

  it("orders items by created_at descending", () => {
    const { relay, reader } = setup();
    reader.start();

    relay()?.emitEvent(0, event("older", 100));
    relay()?.emitEvent(0, event("newer", 200));

    expect(reader.items.map((e) => e.id)).toEqual(["newer", "older"]);
  });

  it("does not list the same event twice when two relays deliver it", () => {
    const { relays, reader } = setup(["wss://a/", "wss://b/"]);
    reader.start();

    const shared = event("shared", 100);
    relays.get("wss://a/")?.emitEvent(0, shared);
    relays.get("wss://b/")?.emitEvent(0, shared);

    expect(reader.items).toHaveLength(1);
  });

  it("counts a closed relay as unreachable", () => {
    const { relay, reader } = setup();
    reader.start();

    relay()?.emitClosed(0, "blocked: rate limited");

    expect(reader.status.incomplete?.unreachableRelays).toBe(1);
  });

  it("settles once every relay becomes unreachable, with no relays left to wait on", () => {
    const { relay, reader } = setup();
    reader.start();

    relay()?.emitClosed(0, "blocked: rate limited");

    expect(reader.status.phase).toBe("settled");
    expect(reader.status.incomplete?.unreachableRelays).toBe(1);
  });

  it("keeps at most MAX_ITEMS_PER_SECTION items, dropping the oldest", () => {
    const { relay, reader } = setup();
    reader.start();

    for (let i = 0; i < MAX_ITEMS_PER_SECTION + 10; i += 1) {
      relay()?.emitEvent(0, event(`note-${i}`, 1000 + i));
    }

    expect(reader.items).toHaveLength(MAX_ITEMS_PER_SECTION);
    expect(reader.items.at(-1)?.id).toBe("note-10");
  });

  it("keeps the most recently arrived items when capped in ascending order", () => {
    const relays = new Map<string, FakeRelayConnection>();
    const store = new PassThroughStore();
    const manager = new SubscriptionManager({
      store,
      routing: new RoutingTable(store),
      connect: (url) => {
        const relay = new FakeRelayConnection(url);
        relays.set(url, relay);
        return relay;
      },
      fallbackRelays: ["wss://fallback/"],
    });
    const reader = new SectionReader({
      source: {
        type: "nostr",
        filters: [{ kinds: [1] }],
        relays: ["wss://a/"],
      },
      order: "created-at-asc",
      store,
      manager,
    });
    reader.start();

    for (let i = 0; i < MAX_ITEMS_PER_SECTION + 10; i += 1) {
      relays.get("wss://a/")?.emitEvent(0, event(`note-${i}`, 1000 + i));
    }

    // Ascending display order: oldest-kept item first, newest-arrived item last.
    // If the cap wrongly kept the *oldest* 500 arrivals instead of the most
    // recent 500, this would read "note-0" / "note-499" instead.
    expect(reader.items).toHaveLength(MAX_ITEMS_PER_SECTION);
    expect(reader.items[0]?.id).toBe("note-10");
    expect(reader.items.at(-1)?.id).toBe(`note-${MAX_ITEMS_PER_SECTION + 9}`);
  });

  it("notifies listeners when items change", () => {
    const { relay, reader } = setup();
    const listener = vi.fn();
    reader.subscribe(listener);
    reader.start();

    relay()?.emitEvent(0, event("first", 100));

    expect(listener).toHaveBeenCalled();
  });

  it("closes every relay subscription on stop", () => {
    const { relay, reader } = setup();
    reader.start();
    reader.stop();

    expect(relay()?.subscriptions[0].closed).toBe(true);
  });

  // Connection ownership moved to SubscriptionManager (ADR-0023): the reader
  // no longer holds a raw connection to release, it releases its handle and
  // the manager decides whether the underlying connection actually closes
  // (refcounted across sections sharing the same relay url). With only one
  // section on this relay, releasing its handle drops the last reference.
  it("closes the connection via the manager once the last section releases it on stop", () => {
    const { manager, reader } = setup();
    reader.start();
    expect(manager.connectionCount).toBe(1);

    reader.stop();
    expect(manager.connectionCount).toBe(0);
  });

  it("does not expose its internal items array by reference", () => {
    const { relay, reader } = setup();
    reader.start();

    relay()?.emitEvent(0, event("first", 100));
    const items = reader.items;
    items.push(event("mutated", 999));
    items.length = 0;

    expect(reader.items.map((e) => e.id)).toEqual(["first"]);
  });

  // CRITICAL 1: EventStore.put returns "duplicate" for *any* caller once one
  // section has inserted the event, regardless of which section put it there.
  // A PassThroughStore (private per-instance Set) cannot expose this: only a
  // real EventStore shared across two SectionReaders can. Two sections over
  // the same relay/store is the intended usage (a deck column and a user
  // column showing the same author).
  it("lists an event in every section sharing a real EventStore, not just the section that inserted it first", () => {
    const sharedStore = new EventStore();
    const relays = new Map<string, FakeRelayConnection>();
    const manager = new SubscriptionManager({
      store: sharedStore,
      routing: new RoutingTable(sharedStore),
      connect: (url) => {
        const relay = new FakeRelayConnection(url);
        relays.set(url, relay);
        return relay;
      },
      fallbackRelays: ["wss://fallback/"],
    });

    const readerA = new SectionReader({
      source: {
        type: "nostr",
        filters: [{ kinds: [1] }],
        relays: ["wss://a/"],
      },
      order: "created-at-desc",
      store: sharedStore,
      manager,
    });
    const readerB = new SectionReader({
      source: {
        type: "nostr",
        filters: [{ kinds: [1] }],
        relays: ["wss://b/"],
      },
      order: "created-at-desc",
      store: sharedStore,
      manager,
    });
    readerA.start();
    readerB.start();

    const shared = signedEvent("hello from both sections", 100);
    // readerA's relay delivers first, inserting into the shared store...
    relays.get("wss://a/")?.emitEvent(0, shared);
    // ...then readerB's relay delivers the very same event. Today this
    // returns "duplicate" from the store and readerB silently drops it.
    relays.get("wss://b/")?.emitEvent(0, shared);

    expect(readerA.items.map((e) => e.id)).toEqual([shared.id]);
    expect(readerB.items.map((e) => e.id)).toEqual([shared.id]);
  });

  // CRITICAL 2: EventStore.put returns "duplicate" from the id lookup
  // *before* verifyEvent runs. Once a genuine event with some id has been
  // stored, a malicious relay can resend a forged object reusing that id
  // (different pubkey/content/created_at, bogus sig) and "duplicate" lets it
  // straight past the "rejected" gate. Listing the relay-supplied object
  // (instead of the store's verified copy) would spoof content under a
  // trusted id and, since created_at need not even be a number here, feed a
  // non-number into the sort comparator used for the MAX_ITEMS_PER_SECTION
  // cap, corrupting ordering/eviction for everyone reading that store.
  it("lists the store's verified copy, not a forged object a second relay resends under a genuine event's id", () => {
    const sharedStore = new EventStore();
    const relays = new Map<string, FakeRelayConnection>();
    const manager = new SubscriptionManager({
      store: sharedStore,
      routing: new RoutingTable(sharedStore),
      connect: (url) => {
        const relay = new FakeRelayConnection(url);
        relays.set(url, relay);
        return relay;
      },
      fallbackRelays: ["wss://fallback/"],
    });

    const readerA = new SectionReader({
      source: {
        type: "nostr",
        filters: [{ kinds: [1] }],
        relays: ["wss://a/"],
      },
      order: "created-at-desc",
      store: sharedStore,
      manager,
    });
    const readerB = new SectionReader({
      source: {
        type: "nostr",
        filters: [{ kinds: [1] }],
        relays: ["wss://b/"],
      },
      order: "created-at-desc",
      store: sharedStore,
      manager,
    });
    readerA.start();
    readerB.start();

    const genuine = signedEvent("GENUINE", 100);
    relays.get("wss://a/")?.emitEvent(0, genuine);

    // relayB is malicious: it reuses genuine's id but swaps in a different
    // pubkey, content, a string created_at, and a bogus sig. EventStore.put
    // finds the id already present and returns "duplicate" without ever
    // calling verifyEvent on this object.
    const forged = {
      ...genuine,
      pubkey: "ff".repeat(32),
      content: "ATTACKER CONTENT",
      // biome-ignore lint/suspicious/noExplicitAny: deliberately malformed to prove the type-confusion hazard
      created_at: "1700000000" as any,
      sig: "00".repeat(64),
    };
    relays.get("wss://b/")?.emitEvent(0, forged);

    expect(readerB.items).toHaveLength(1);
    expect(readerB.items[0]?.content).toBe("GENUINE");
    expect(readerB.items[0]?.pubkey).toBe(genuine.pubkey);
    expect(typeof readerB.items[0]?.created_at).toBe("number");
  });

  // An explicit `relays: []` bypasses Outbox routing entirely (NostrSource's
  // `relays` doc comment) and asks for nothing: the manager opens no
  // connection and reports zero unroutable authors, so the section has
  // nothing to wait on and settles immediately with no incomplete block.
  // (Contrast with `relays: undefined`, covered below, which does route.)
  it("settles immediately with no incomplete block when the source explicitly lists zero relays", () => {
    const store = new EventStore();
    const manager = new SubscriptionManager({
      store,
      routing: new RoutingTable(store),
      connect: () => {
        throw new Error("must not open any relay for an explicit empty list");
      },
      fallbackRelays: ["wss://fallback/"],
    });
    const reader = new SectionReader({
      source: { type: "nostr", filters: [{ kinds: [1] }], relays: [] },
      order: "created-at-desc",
      store,
      manager,
    });
    reader.start();

    expect(reader.status.phase).toBe("settled");
    expect(reader.status.incomplete).toBeUndefined();
  });
});

const relayListEvent = (seed: number, tags: string[][]): NostrEvent => {
  const sk = Uint8Array.from(
    Array.from({ length: 32 }, (_, i) => ((seed + i * 7) % 255) + 1),
  );
  const unsigned = {
    pubkey: bytesToHex(schnorr.getPublicKey(sk)),
    created_at: 1_700_000_000,
    kind: 10002,
    tags,
    content: "",
  };
  const id = computeEventId(unsigned);
  return { ...unsigned, id, sig: bytesToHex(schnorr.sign(hexToBytes(id), sk)) };
};

describe("SectionReader with Outbox routing", () => {
  it("waits on the relays the routing table chose, not a hardcoded list", () => {
    const relays = new Map<string, FakeRelayConnection>();
    const store = new EventStore();
    const authorList = relayListEvent(7, [["r", "wss://chosen/", "write"]]);
    store.put(authorList, "wss://indexer/");

    const manager = new SubscriptionManager({
      store,
      routing: new RoutingTable(store),
      connect: (url) => {
        const relay = new FakeRelayConnection(url);
        relays.set(url, relay);
        return relay;
      },
      fallbackRelays: ["wss://fallback/"],
    });
    const reader = new SectionReader({
      source: {
        type: "nostr",
        filters: [{ kinds: [1], authors: [authorList.pubkey] }],
      },
      order: "created-at-desc",
      store,
      manager,
    });
    reader.start();

    expect(relays.has("wss://chosen/")).toBe(true);
    expect(relays.has("wss://fallback/")).toBe(false);

    relays.get("wss://chosen/")?.emitEose(0);
    expect(reader.status.phase).toBe("settled");
    expect(reader.status.incomplete).toBeUndefined();
  });

  it("reports authors it could not route", () => {
    const relays = new Map<string, FakeRelayConnection>();
    const store = new EventStore();
    const manager = new SubscriptionManager({
      store,
      routing: new RoutingTable(store),
      connect: (url) => {
        const relay = new FakeRelayConnection(url);
        relays.set(url, relay);
        return relay;
      },
      fallbackRelays: ["wss://fallback/"],
    });
    const reader = new SectionReader({
      source: {
        type: "nostr",
        filters: [{ kinds: [1], authors: ["f".repeat(64)] }],
      },
      order: "created-at-desc",
      store,
      manager,
    });
    reader.start();
    relays.get("wss://fallback/")?.emitEose(0);

    expect(reader.status.phase).toBe("settled");
    expect(reader.status.incomplete?.unroutableAuthors).toBe(1);
  });
});
