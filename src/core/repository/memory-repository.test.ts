import type { NostrEvent } from "nostr-tools";
import { describe, expect, test } from "vitest";
import { MemoryNostrRepository } from "./memory-repository";

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

describe("MemoryNostrRepository", () => {
  test("stores raw events by id and reports duplicates without replacing the original event", async () => {
    const repository = new MemoryNostrRepository();
    const first = event({ id: "event-1", content: "first" });
    const duplicate = event({ id: "event-1", content: "duplicate" });

    await expect(
      repository.putEvent({ event: first, relay: "wss://relay-a.example" }),
    ).resolves.toEqual({ type: "inserted", event: first });
    await expect(
      repository.putEvent({ event: duplicate, relay: "wss://relay-b.example" }),
    ).resolves.toEqual({ type: "duplicate", event: first });

    await expect(repository.getEvent("event-1")).resolves.toEqual(first);
    await expect(repository.getEvents(["missing", "event-1"])).resolves.toEqual(
      [first],
    );
  });

  test("tracks all relays that have seen an event", async () => {
    const repository = new MemoryNostrRepository();
    const note = event({ id: "event-1" });

    await repository.putEvent({ event: note, relay: "wss://relay-a.example" });
    await repository.putEvent({ event: note, relay: "wss://relay-b.example" });
    await repository.markSeen("event-1", "wss://relay-c.example");

    await expect(repository.getSeenRelays("event-1")).resolves.toEqual([
      "wss://relay-a.example",
      "wss://relay-b.example",
      "wss://relay-c.example",
    ]);
  });

  test("resolves the newest regular replaceable event by kind and pubkey", async () => {
    const repository = new MemoryNostrRepository();
    const oldProfile = event({
      id: "old-profile",
      kind: 0,
      pubkey: "alice",
      created_at: 100,
    });
    const newProfile = event({
      id: "new-profile",
      kind: 0,
      pubkey: "alice",
      created_at: 200,
    });
    const staleProfile = event({
      id: "stale-profile",
      kind: 0,
      pubkey: "alice",
      created_at: 150,
    });

    await repository.putEvent({
      event: oldProfile,
      relay: "wss://relay.example",
    });
    await repository.putEvent({
      event: newProfile,
      relay: "wss://relay.example",
    });
    await repository.putEvent({
      event: staleProfile,
      relay: "wss://relay.example",
    });

    await expect(repository.getLatestReplaceable(0, "alice")).resolves.toEqual(
      newProfile,
    );
  });

  test("resolves the newest parameterized replaceable event by kind, pubkey, and d tag", async () => {
    const repository = new MemoryNostrRepository();
    const oldList = event({
      id: "old-list",
      kind: 30000,
      pubkey: "alice",
      created_at: 100,
      tags: [["d", "bookmarks"]],
    });
    const newList = event({
      id: "new-list",
      kind: 30000,
      pubkey: "alice",
      created_at: 200,
      tags: [["d", "bookmarks"]],
    });
    const otherList = event({
      id: "other-list",
      kind: 30000,
      pubkey: "alice",
      created_at: 300,
      tags: [["d", "mute"]],
    });

    await repository.putEvent({ event: oldList, relay: "wss://relay.example" });
    await repository.putEvent({ event: newList, relay: "wss://relay.example" });
    await repository.putEvent({
      event: otherList,
      relay: "wss://relay.example",
    });

    await expect(
      repository.getParameterizedReplaceable(30000, "alice", "bookmarks"),
    ).resolves.toEqual(newList);
    await expect(
      repository.getParameterizedReplaceable(30000, "alice", "mute"),
    ).resolves.toEqual(otherList);
  });

  test("queries events by ids, authors, kinds, and tag filters", async () => {
    const repository = new MemoryNostrRepository();
    const aliceNote = event({
      id: "alice-note",
      pubkey: "alice",
      kind: 1,
      created_at: 100,
      tags: [
        ["p", "bob"],
        ["t", "nostr"],
      ],
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
      created_at: 300,
      tags: [["t", "solidjs"]],
    });

    await repository.putEvent({
      event: aliceNote,
      relay: "wss://relay.example",
    });
    await repository.putEvent({
      event: bobReaction,
      relay: "wss://relay.example",
    });
    await repository.putEvent({
      event: carolNote,
      relay: "wss://relay.example",
    });

    await expect(
      repository.queryEvents({ authors: ["alice", "carol"], kinds: [1] }),
    ).resolves.toEqual([carolNote, aliceNote]);
    await expect(
      repository.queryEvents({ tags: { p: ["bob"] } }),
    ).resolves.toEqual([aliceNote]);
    await expect(
      repository.queryEvents({
        ids: ["bob-reaction"],
        tags: { e: ["alice-note"] },
      }),
    ).resolves.toEqual([bobReaction]);
  });
});
