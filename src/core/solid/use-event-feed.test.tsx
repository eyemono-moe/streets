import { type NostrEvent, kinds } from "nostr-tools";
import { EMPTY } from "rxjs";
import { createRoot } from "solid-js";
import { describe, expect, test, vi } from "vitest";
import type { EventFeedDefinition } from "../query/event-feed";
import type { NostrCoreQueryClient } from "../query/query-client";
import { MemoryNostrRepository } from "../repository/memory-repository";
import { NostrCoreProvider, createNostrCore } from "./provider";
import { useCoreEventFeed } from "./use-event-feed";

const createEvent = (override: Partial<NostrEvent> = {}): NostrEvent => ({
  id: override.id ?? "event-1",
  pubkey: override.pubkey ?? "alice",
  kind: override.kind ?? kinds.ShortTextNote,
  content: override.content ?? "hello",
  tags: override.tags ?? [],
  created_at: override.created_at ?? 100,
  sig: override.sig ?? "sig",
});

const createCore = ({
  fetchMoreEventFeed,
}: {
  fetchMoreEventFeed?: NostrCoreQueryClient["fetchMoreEventFeed"];
} = {}) => {
  const ensuredFeeds: EventFeedDefinition[] = [];
  const fetchedFeedIds: string[] = [];
  const stoppedFeedIds: string[] = [];
  const queryClient: NostrCoreQueryClient = {
    async ensureEvent() {
      return undefined;
    },
    async ensureProfile() {
      return undefined;
    },
    async ensureEventRelations() {
      return [];
    },
    async fetchEventPage() {
      return [];
    },
    ensureEventFeed(definition) {
      ensuredFeeds.push(definition);
    },
    async fetchMoreEventFeed(feedId) {
      fetchedFeedIds.push(feedId);
      return fetchMoreEventFeed?.(feedId) ?? [];
    },
    stopEventFeed(feedId) {
      stoppedFeedIds.push(feedId);
    },
    dispose() {},
  };
  const rxNostr = {
    createConnectionStateObservable: () => EMPTY,
  } as Parameters<typeof createNostrCore>[0]["rxNostr"];
  const repository = new MemoryNostrRepository();
  return {
    core: createNostrCore({ rxNostr, repository, queryClient }),
    ensuredFeeds,
    fetchedFeedIds,
    stoppedFeedIds,
  };
};

describe("useCoreEventFeed", () => {
  test("ensures the feed and returns parsed events ordered by feed rows", async () => {
    const { core, ensuredFeeds } = createCore();
    const older = createEvent({
      id: "older",
      created_at: 100,
      content: "older",
    });
    const newer = createEvent({
      id: "newer",
      created_at: 200,
      content: "newer",
    });

    await core.repository.putEvent({
      event: older,
      relay: "wss://relay.example",
    });
    await core.repository.putEvent({
      event: newer,
      relay: "wss://relay.example",
    });
    core.feedStateStore.addItem("feed-a", older);
    core.feedStateStore.addItem("feed-a", newer);
    core.feedStateStore.setStatus("feed-a", "live", {
      hasMoreBackfill: true,
      activeRelays: ["wss://relay.example"],
      eoseRelays: [],
    });

    await new Promise<void>((resolve) => {
      createRoot((dispose) => {
        NostrCoreProvider({
          core,
          get children() {
            const feed = useCoreEventFeed(() => ({
              id: "feed-a",
              filters: { kinds: [kinds.ShortTextNote] },
              strategy: "liveBackfill",
              relays: ["wss://relay.example"],
            }));

            queueMicrotask(async () => {
              await vi.waitFor(() => {
                expect(feed.events().map((event) => event.raw.id)).toEqual([
                  "newer",
                  "older",
                ]);
                expect(feed.isFetching()).toBe(false);
                expect(feed.hasNextPage()).toBe(true);
              });
              expect(ensuredFeeds).toEqual([
                {
                  id: "feed-a",
                  filters: { kinds: [kinds.ShortTextNote] },
                  strategy: "liveBackfill",
                  relays: ["wss://relay.example"],
                },
              ]);
              dispose();
              resolve();
            });
            return null;
          },
        });
      });
    });
  });

  test("delegates fetchNextPage to the feed query client", async () => {
    const { core, fetchedFeedIds } = createCore();

    await new Promise<void>((resolve) => {
      createRoot((dispose) => {
        NostrCoreProvider({
          core,
          get children() {
            const feed = useCoreEventFeed(() => ({
              id: "feed-b",
              filters: { authors: ["alice"] },
              strategy: "liveBackfill",
            }));

            queueMicrotask(async () => {
              await feed.fetchNextPage();
              expect(fetchedFeedIds).toEqual(["feed-b"]);
              dispose();
              resolve();
            });
            return null;
          },
        });
      });
    });
  });

  test("allows a fresh liveBackfill feed to request the first backfill page", async () => {
    const { core, fetchedFeedIds } = createCore();

    await new Promise<void>((resolve) => {
      createRoot((dispose) => {
        NostrCoreProvider({
          core,
          get children() {
            const feed = useCoreEventFeed(() => ({
              id: "feed-c",
              filters: { kinds: [kinds.ShortTextNote] },
              strategy: "liveBackfill",
            }));

            queueMicrotask(async () => {
              await vi.waitFor(() => {
                expect(feed.hasNextPage()).toBe(true);
                expect(feed.isFetching()).toBe(false);
              });
              await feed.fetchNextPage();
              expect(fetchedFeedIds).toEqual(["feed-c"]);
              dispose();
              resolve();
            });
            return null;
          },
        });
      });
    });
  });

  test("keeps pagination fetching state until fetchMore settles and ignores overlapping fetches", async () => {
    let resolveFetch: (() => void) | undefined;
    const { core, fetchedFeedIds } = createCore({
      fetchMoreEventFeed: () =>
        new Promise((resolve) => {
          resolveFetch = () => resolve([]);
        }),
    });
    const event = createEvent({ id: "mid-fetch", created_at: 150 });

    await new Promise<void>((resolve) => {
      createRoot((dispose) => {
        NostrCoreProvider({
          core,
          get children() {
            const feed = useCoreEventFeed(() => ({
              id: "feed-d",
              filters: { kinds: [kinds.ShortTextNote] },
              strategy: "liveBackfill",
            }));

            queueMicrotask(async () => {
              await vi.waitFor(() => {
                expect(feed.isFetching()).toBe(false);
              });
              const firstFetch = feed.fetchNextPage();
              expect(feed.isFetching()).toBe(true);

              await core.repository.putEvent({
                event,
                relay: "wss://relay.example",
              });
              core.feedStateStore.addItem("feed-d", event);
              await vi.waitFor(() => {
                expect(feed.events().map((packet) => packet.raw.id)).toEqual([
                  "mid-fetch",
                ]);
              });
              expect(feed.isFetching()).toBe(true);

              await expect(feed.fetchNextPage()).resolves.toEqual([]);
              expect(fetchedFeedIds).toEqual(["feed-d"]);

              resolveFetch?.();
              await firstFetch;
              expect(feed.isFetching()).toBe(false);
              dispose();
              resolve();
            });
            return null;
          },
        });
      });
    });
  });
});
