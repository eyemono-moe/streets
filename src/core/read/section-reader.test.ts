import { schnorr } from "@noble/curves/secp256k1.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import { describe, expect, it, vi } from "vitest";
import { type NostrEvent, computeEventId } from "../nostr/event";
import { FakeRelayConnection } from "../relay/fake-relay-connection";
import { EventStore } from "./event-store";
import { SectionReader } from "./section-reader";
import { MAX_ITEMS_PER_SECTION } from "./source";

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

const setup = () => {
  const relay = new FakeRelayConnection("wss://a");
  const reader = new SectionReader({
    source: { type: "nostr", filters: [{ kinds: [1] }], relays: ["wss://a"] },
    order: "created-at-desc",
    store: new PassThroughStore(),
    openRelay: () => relay,
  });
  return { relay, reader };
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

    relay.emitEvent(0, event("first", 100));

    expect(reader.status.phase).toBe("streaming");
    expect(reader.items.map((e) => e.id)).toEqual(["first"]);
  });

  it("settles when every relay has sent eose", () => {
    const { relay, reader } = setup();
    reader.start();

    relay.emitEvent(0, event("first", 100));
    relay.emitEose(0);

    expect(reader.status.phase).toBe("settled");
  });

  it("orders items by created_at descending", () => {
    const { relay, reader } = setup();
    reader.start();

    relay.emitEvent(0, event("older", 100));
    relay.emitEvent(0, event("newer", 200));

    expect(reader.items.map((e) => e.id)).toEqual(["newer", "older"]);
  });

  it("does not list the same event twice when two relays deliver it", () => {
    const relayA = new FakeRelayConnection("wss://a");
    const relayB = new FakeRelayConnection("wss://b");
    const reader = new SectionReader({
      source: {
        type: "nostr",
        filters: [{ kinds: [1] }],
        relays: ["wss://a", "wss://b"],
      },
      order: "created-at-desc",
      store: new PassThroughStore(),
      openRelay: (url) => (url === "wss://a" ? relayA : relayB),
    });
    reader.start();

    const shared = event("shared", 100);
    relayA.emitEvent(0, shared);
    relayB.emitEvent(0, shared);

    expect(reader.items).toHaveLength(1);
  });

  it("counts a closed relay as unreachable", () => {
    const { relay, reader } = setup();
    reader.start();

    relay.emitClosed(0, "blocked: rate limited");

    expect(reader.status.incomplete?.unreachableRelays).toBe(1);
  });

  it("settles once every relay becomes unreachable, with no relays left to wait on", () => {
    const { relay, reader } = setup();
    reader.start();

    relay.emitClosed(0, "blocked: rate limited");

    expect(reader.status.phase).toBe("settled");
    expect(reader.status.incomplete?.unreachableRelays).toBe(1);
  });

  it("keeps at most MAX_ITEMS_PER_SECTION items, dropping the oldest", () => {
    const { relay, reader } = setup();
    reader.start();

    for (let i = 0; i < MAX_ITEMS_PER_SECTION + 10; i += 1) {
      relay.emitEvent(0, event(`note-${i}`, 1000 + i));
    }

    expect(reader.items).toHaveLength(MAX_ITEMS_PER_SECTION);
    expect(reader.items.at(-1)?.id).toBe("note-10");
  });

  it("keeps the most recently arrived items when capped in ascending order", () => {
    const relay = new FakeRelayConnection("wss://a");
    const reader = new SectionReader({
      source: { type: "nostr", filters: [{ kinds: [1] }], relays: ["wss://a"] },
      order: "created-at-asc",
      store: new PassThroughStore(),
      openRelay: () => relay,
    });
    reader.start();

    for (let i = 0; i < MAX_ITEMS_PER_SECTION + 10; i += 1) {
      relay.emitEvent(0, event(`note-${i}`, 1000 + i));
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

    relay.emitEvent(0, event("first", 100));

    expect(listener).toHaveBeenCalled();
  });

  it("closes every relay subscription on stop", () => {
    const { relay, reader } = setup();
    reader.start();
    reader.stop();

    expect(relay.subscriptions[0].closed).toBe(true);
  });

  it("releases each relay's connection via releaseRelay on stop, passing the url and the connection openRelay returned", () => {
    const relay = new FakeRelayConnection("wss://a");
    const releaseRelay = vi.fn();
    const reader = new SectionReader({
      source: { type: "nostr", filters: [{ kinds: [1] }], relays: ["wss://a"] },
      order: "created-at-desc",
      store: new PassThroughStore(),
      openRelay: () => relay,
      releaseRelay,
    });
    reader.start();
    reader.stop();

    expect(relay.subscriptions[0].closed).toBe(true);
    expect(releaseRelay).toHaveBeenCalledTimes(1);
    expect(releaseRelay).toHaveBeenCalledWith("wss://a", relay);
  });

  it("does not close the underlying connection itself on stop when releaseRelay is not provided (borrow case: the connection may be shared/pooled)", () => {
    const { relay, reader } = setup();
    reader.start();
    reader.stop();

    expect(relay.subscriptions[0].closed).toBe(true);
    expect(relay.closed).toBe(false);
  });

  it("does not expose its internal items array by reference", () => {
    const { relay, reader } = setup();
    reader.start();

    relay.emitEvent(0, event("first", 100));
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
    const relayA = new FakeRelayConnection("wss://a");
    const relayB = new FakeRelayConnection("wss://b");

    const readerA = new SectionReader({
      source: { type: "nostr", filters: [{ kinds: [1] }], relays: ["wss://a"] },
      order: "created-at-desc",
      store: sharedStore,
      openRelay: () => relayA,
    });
    const readerB = new SectionReader({
      source: { type: "nostr", filters: [{ kinds: [1] }], relays: ["wss://b"] },
      order: "created-at-desc",
      store: sharedStore,
      openRelay: () => relayB,
    });
    readerA.start();
    readerB.start();

    const shared = signedEvent("hello from both sections", 100);
    // readerA's relay delivers first, inserting into the shared store...
    relayA.emitEvent(0, shared);
    // ...then readerB's relay delivers the very same event. Today this
    // returns "duplicate" from the store and readerB silently drops it.
    relayB.emitEvent(0, shared);

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
    const relayA = new FakeRelayConnection("wss://a");
    const relayB = new FakeRelayConnection("wss://b");

    const readerA = new SectionReader({
      source: { type: "nostr", filters: [{ kinds: [1] }], relays: ["wss://a"] },
      order: "created-at-desc",
      store: sharedStore,
      openRelay: () => relayA,
    });
    const readerB = new SectionReader({
      source: { type: "nostr", filters: [{ kinds: [1] }], relays: ["wss://b"] },
      order: "created-at-desc",
      store: sharedStore,
      openRelay: () => relayB,
    });
    readerA.start();
    readerB.start();

    const genuine = signedEvent("GENUINE", 100);
    relayA.emitEvent(0, genuine);

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
    relayB.emitEvent(0, forged);

    expect(readerB.items).toHaveLength(1);
    expect(readerB.items[0]?.content).toBe("GENUINE");
    expect(readerB.items[0]?.pubkey).toBe(genuine.pubkey);
    expect(typeof readerB.items[0]?.created_at).toBe("number");
  });

  // IMPORTANT 2: a source with no explicit `relays` opens nothing, so `live`
  // is vacuously empty and the section reports "settled" with no incomplete
  // block — indistinguishable from "checked everywhere, found nothing".
  // `relays` is omitted precisely to mean "route via Outbox" (not implemented
  // yet), so this is the shape every source will have once routing lands.
  it("surfaces incomplete when a source has no relays (relays: undefined)", () => {
    const reader = new SectionReader({
      source: { type: "nostr", filters: [{ kinds: [1] }] },
      order: "created-at-desc",
      store: new EventStore(),
      openRelay: () => {
        throw new Error("must not open any relay when none are configured");
      },
    });
    reader.start();

    expect(reader.status.incomplete).toBeDefined();
  });

  it("surfaces incomplete when a source has no relays (relays: [])", () => {
    const reader = new SectionReader({
      source: { type: "nostr", filters: [{ kinds: [1] }], relays: [] },
      order: "created-at-desc",
      store: new EventStore(),
      openRelay: () => {
        throw new Error("must not open any relay when none are configured");
      },
    });
    reader.start();

    expect(reader.status.incomplete).toBeDefined();
  });

  it("reports unroutableAuthors as the number of distinct authors named across filters when there are no relays", () => {
    const reader = new SectionReader({
      source: {
        type: "nostr",
        filters: [{ authors: ["alice", "bob"] }, { authors: ["bob", "carol"] }],
      },
      order: "created-at-desc",
      store: new EventStore(),
      openRelay: () => {
        throw new Error("must not open any relay when none are configured");
      },
    });
    reader.start();

    expect(reader.status.incomplete?.unroutableAuthors).toBe(3);
  });

  it("reports unroutableAuthors as 0 when no relays are configured and no filter names authors", () => {
    const reader = new SectionReader({
      source: { type: "nostr", filters: [{ kinds: [1] }] },
      order: "created-at-desc",
      store: new EventStore(),
      openRelay: () => {
        throw new Error("must not open any relay when none are configured");
      },
    });
    reader.start();

    expect(reader.status.incomplete?.unroutableAuthors).toBe(0);
  });
});
