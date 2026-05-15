import type { NostrEvent } from "nostr-tools";
import { describe, expect, test } from "vitest";
import { createNostrCollections } from "../collections";
import { projectRepositoryEvent } from "./project-event";

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

describe("repository event projection", () => {
  test("upserts a repository event into the event collection", async () => {
    const collections = createNostrCollections();
    const note = event({ id: "event-1", content: "hello" });

    await projectRepositoryEvent(collections, note, {
      receivedAt: 1_000,
      seenRelays: ["wss://relay-a.example"],
    });

    expect(collections.events.get("event-1")).toMatchObject({
      id: "event-1",
      raw: note,
      receivedAt: 1_000,
      seenRelays: ["wss://relay-a.example"],
    });
  });

  test("merges seen relay metadata for duplicate relay events without duplicating rows", async () => {
    const collections = createNostrCollections();
    const note = event({ id: "event-1", content: "hello" });

    await projectRepositoryEvent(collections, note, {
      receivedAt: 1_000,
      seenRelays: ["wss://relay-a.example", "wss://relay-b.example"],
    });
    await projectRepositoryEvent(collections, note, {
      receivedAt: 1_001,
      seenRelays: ["wss://relay-b.example", "wss://relay-c.example"],
    });

    expect(collections.events.get("event-1")).toMatchObject({
      id: "event-1",
      receivedAt: 1_001,
      seenRelays: [
        "wss://relay-a.example",
        "wss://relay-b.example",
        "wss://relay-c.example",
      ],
    });
    expect(collections.events.size).toBe(1);
  });

  test("projects kind 0 metadata and ignores older profile events", async () => {
    const collections = createNostrCollections();
    const newerProfile = event({
      id: "profile-new",
      kind: 0,
      pubkey: "alice",
      created_at: 200,
      content: JSON.stringify({ name: "new-alice" }),
    });
    const olderProfile = event({
      id: "profile-old",
      kind: 0,
      pubkey: "alice",
      created_at: 100,
      content: JSON.stringify({ name: "old-alice" }),
    });

    await projectRepositoryEvent(collections, newerProfile, {
      receivedAt: 1_000,
      seenRelays: ["wss://relay-a.example"],
    });
    await projectRepositoryEvent(collections, olderProfile, {
      receivedAt: 1_001,
      seenRelays: ["wss://relay-b.example"],
    });

    expect(collections.profiles.get("alice")).toMatchObject({
      pubkey: "alice",
      name: "new-alice",
      sourceEventId: "profile-new",
      updatedAt: 200,
      seenRelays: ["wss://relay-a.example"],
    });
    expect(collections.events.size).toBe(2);
  });

  test("is idempotent when the same repository event is projected more than once", async () => {
    const collections = createNostrCollections();
    const profile = event({
      id: "profile-1",
      kind: 0,
      pubkey: "alice",
      created_at: 100,
      content: JSON.stringify({ name: "alice" }),
    });

    await projectRepositoryEvent(collections, profile, {
      receivedAt: 1_000,
      seenRelays: ["wss://relay-a.example"],
    });
    await projectRepositoryEvent(collections, profile, {
      receivedAt: 1_001,
      seenRelays: ["wss://relay-b.example"],
    });

    expect(collections.events.size).toBe(1);
    expect(collections.profiles.size).toBe(1);
    expect(collections.profiles.get("alice")).toMatchObject({
      name: "alice",
      receivedAt: 1_001,
      seenRelays: ["wss://relay-a.example", "wss://relay-b.example"],
    });
  });
});
