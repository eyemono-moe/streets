import type { NostrEvent } from "nostr-tools";
import { describe, expect, test } from "vitest";
import { createNostrCollections } from "../collections";
import {
  projectEventFeedItem,
  upsertEventFeedItem,
  upsertEventFeedState,
} from "./event-feed";

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

describe("event feed read-model projection", () => {
  test("upserts feed items by feed id and event id without duplicating raw events", async () => {
    const collections = createNostrCollections();
    const note = event({ id: "event-1", pubkey: "alice", created_at: 123 });

    await upsertEventFeedItem(collections, {
      feedId: "user:alice:posts",
      event: note,
      insertedAt: 1_000,
    });
    await upsertEventFeedItem(collections, {
      feedId: "user:alice:posts",
      event: note,
      insertedAt: 1_001,
    });
    await upsertEventFeedItem(collections, {
      feedId: "search:nostr",
      event: note,
      insertedAt: 1_002,
      matchedFilterIndex: 1,
      score: 42,
    });

    expect(collections.eventFeedItems.size).toBe(2);
    expect(
      collections.eventFeedItems.get("user:alice:posts:event-1"),
    ).toMatchObject({
      id: "user:alice:posts:event-1",
      feedId: "user:alice:posts",
      eventId: "event-1",
      pubkey: "alice",
      kind: 1,
      createdAt: 123,
      insertedAt: 1_001,
      matchedFilterIndex: undefined,
      score: undefined,
    });
    expect(
      collections.eventFeedItems.get("search:nostr:event-1"),
    ).toMatchObject({
      feedId: "search:nostr",
      eventId: "event-1",
      matchedFilterIndex: 1,
      score: 42,
    });
  });

  test("projects feed item rows from raw events without copying raw event payloads", () => {
    const note = event({ id: "event-1", pubkey: "alice", created_at: 123 });

    expect(
      projectEventFeedItem({
        feedId: "feed-a",
        event: note,
        insertedAt: 1_000,
      }),
    ).toEqual({
      id: "feed-a:event-1",
      feedId: "feed-a",
      eventId: "event-1",
      pubkey: "alice",
      kind: 1,
      createdAt: 123,
      insertedAt: 1_000,
      matchedFilterIndex: undefined,
      score: undefined,
    });
  });

  test("upserts feed state cursor and relay lifecycle fields", async () => {
    const collections = createNostrCollections();

    await upsertEventFeedState(collections, {
      feedId: "feed-a",
      strategy: "liveBackfill",
      status: "loading",
      updatedAt: 1_000,
      activeRelays: ["wss://relay-a.example"],
      eoseRelays: [],
    });
    await upsertEventFeedState(collections, {
      feedId: "feed-a",
      strategy: "liveBackfill",
      status: "live",
      updatedAt: 1_001,
      oldestCreatedAt: 100,
      newestCreatedAt: 200,
      hasMoreBackfill: true,
      activeRelays: ["wss://relay-a.example", "wss://relay-b.example"],
      eoseRelays: ["wss://relay-a.example"],
    });

    expect(collections.eventFeedStates.get("feed-a")).toMatchObject({
      id: "feed-a",
      feedId: "feed-a",
      strategy: "liveBackfill",
      status: "live",
      error: undefined,
      oldestCreatedAt: 100,
      newestCreatedAt: 200,
      hasMoreBackfill: true,
      activeRelays: ["wss://relay-a.example", "wss://relay-b.example"],
      eoseRelays: ["wss://relay-a.example"],
      updatedAt: 1_001,
    });
  });
});
