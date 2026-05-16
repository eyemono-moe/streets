import type { NostrEvent } from "nostr-tools";
import { describe, expect, it, vi } from "vitest";
import { MemoryEventStore } from "./memory-event-store";

const event = (
  overrides: Partial<NostrEvent> & { id: string },
): NostrEvent => ({
  id: overrides.id,
  pubkey: overrides.pubkey ?? "pubkey-a",
  created_at: overrides.created_at ?? 100,
  kind: overrides.kind ?? 1,
  tags: overrides.tags ?? [],
  content: overrides.content ?? "",
  sig: overrides.sig ?? `${overrides.id}-sig`,
});

describe("MemoryEventStore", () => {
  it("deduplicates events and still tracks every relay that saw the event", () => {
    const store = new MemoryEventStore();
    const note = event({ id: "note-1" });
    const listener = vi.fn();

    store.subscribe(listener);

    expect(store.putEvent({ event: note, relay: "wss://relay-a" })).toEqual({
      type: "inserted",
      event: note,
    });
    expect(store.putEvent({ event: note, relay: "wss://relay-b" })).toEqual({
      type: "duplicate",
      event: note,
    });

    expect(store.getEvent("note-1")).toBe(note);
    expect(store.getSeenRelays("note-1")).toEqual([
      "wss://relay-a",
      "wss://relay-b",
    ]);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("queries events with Nostr filter array semantics", () => {
    const store = new MemoryEventStore();
    const aliceNote = event({
      id: "alice-note",
      pubkey: "alice",
      kind: 1,
      created_at: 100,
      tags: [["t", "nostr"]],
    });
    const bobReaction = event({
      id: "bob-reaction",
      pubkey: "bob",
      kind: 7,
      created_at: 200,
      tags: [["e", "alice-note"]],
    });
    const carolNote = event({
      id: "carol-note",
      pubkey: "carol",
      kind: 1,
      created_at: 150,
      tags: [["t", "solid"]],
    });

    store.putEvent({ event: aliceNote });
    store.putEvent({ event: bobReaction });
    store.putEvent({ event: carolNote });

    expect(
      store.queryEvents([
        { authors: ["alice"], kinds: [1], "#t": ["nostr"] },
        { kinds: [7], "#e": ["alice-note"] },
      ]),
    ).toEqual([bobReaction, aliceNote]);
  });

  it("resolves latest replaceable events without creating a profile source of truth", () => {
    const store = new MemoryEventStore();
    const oldProfile = event({
      id: "profile-old",
      pubkey: "alice",
      kind: 0,
      created_at: 100,
      content: JSON.stringify({ name: "old" }),
    });
    const newProfile = event({
      id: "profile-new",
      pubkey: "alice",
      kind: 0,
      created_at: 200,
      content: JSON.stringify({ name: "new" }),
    });

    store.putEvent({ event: oldProfile });
    store.putEvent({ event: newProfile });

    expect(store.getLatestReplaceable(0, "alice")).toBe(newProfile);
    expect(
      store.queryEvents({ authors: ["alice"], kinds: [0], limit: 1 }),
    ).toEqual([newProfile]);
  });
});
