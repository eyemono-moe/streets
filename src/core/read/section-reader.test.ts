import { describe, expect, it, vi } from "vitest";
import type { NostrEvent } from "../nostr/event";
import { FakeRelayConnection } from "../relay/fake-relay-connection";
import { EventStore } from "./event-store";
import { SectionReader } from "./section-reader";
import { MAX_ITEMS_PER_SECTION } from "./source";

// 署名検証を通さずに SectionReader だけを試すため、EventStore を差し替える
class PassThroughStore extends EventStore {
  readonly #seen = new Set<string>();
  override put(event: NostrEvent): "inserted" | "duplicate" | "rejected" {
    if (this.#seen.has(event.id)) return "duplicate";
    this.#seen.add(event.id);
    return "inserted";
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
});
