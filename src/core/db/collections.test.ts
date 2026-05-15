import type { NostrEvent } from "nostr-tools";
import { describe, expect, test } from "vitest";
import { createNostrCollections } from "./collections";
import {
  projectEventRow,
  projectProfileRow,
  shouldReplaceProfileRow,
} from "./projectors/profile";

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

describe("nostr TanStack DB collections", () => {
  test("creates local UI read-model collections keyed by stable row ids", async () => {
    const collections = createNostrCollections();
    const note = event({ id: "event-1", content: "hello" });
    const eventRow = projectEventRow(note, {
      receivedAt: 1_000,
      seenRelays: ["wss://relay.example"],
    });

    await collections.events.insert(eventRow).isPersisted.promise;
    await collections.queryStates.insert({
      id: "event:event-1",
      filter: { ids: ["event-1"] },
      status: "complete",
      updatedAt: 1_001,
    }).isPersisted.promise;

    expect(collections.events.get("event-1")).toMatchObject({
      id: "event-1",
      pubkey: "pubkey-a",
      kind: 1,
      raw: note,
      seenRelays: ["wss://relay.example"],
    });
    expect(collections.queryStates.get("event:event-1")).toMatchObject({
      id: "event:event-1",
      status: "complete",
    });
  });

  test("projects kind 0 profile metadata without using TanStack DB as the raw repository", () => {
    const rawProfile = event({
      id: "profile-1",
      kind: 0,
      pubkey: "alice",
      created_at: 200,
      content: JSON.stringify({
        name: "alice",
        display_name: "Alice",
        about: "hello nostr",
        picture: "https://example.com/alice.png",
        nip05: "alice@example.com",
        lud16: "alice@example.com",
      }),
    });

    expect(
      projectProfileRow(rawProfile, {
        receivedAt: 1_000,
        seenRelays: ["wss://relay-a.example"],
      }),
    ).toEqual({
      pubkey: "alice",
      name: "alice",
      displayName: "Alice",
      about: "hello nostr",
      picture: "https://example.com/alice.png",
      nip05: "alice@example.com",
      lud16: "alice@example.com",
      sourceEventId: "profile-1",
      updatedAt: 200,
      receivedAt: 1_000,
      seenRelays: ["wss://relay-a.example"],
    });
  });

  test("profile projection ignores non-profile events and older kind 0 metadata", () => {
    const oldProfile = projectProfileRow(
      event({ id: "profile-old", kind: 0, pubkey: "alice", created_at: 100 }),
      { receivedAt: 1_000 },
    );
    const newProfile = projectProfileRow(
      event({ id: "profile-new", kind: 0, pubkey: "alice", created_at: 200 }),
      { receivedAt: 1_001 },
    );

    expect(projectProfileRow(event({ id: "note-1", kind: 1 }))).toBeUndefined();
    expect(oldProfile).toBeDefined();
    expect(newProfile).toBeDefined();
    expect(shouldReplaceProfileRow(newProfile, oldProfile)).toBe(true);
    expect(shouldReplaceProfileRow(oldProfile, newProfile)).toBe(false);
  });
});
