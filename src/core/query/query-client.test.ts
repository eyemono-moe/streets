import type { NostrEvent } from "nostr-tools";
import { Subject } from "rxjs";
import { describe, expect, test, vi } from "vitest";
import { MemoryNostrRepository } from "../repository/memory-repository";
import { MemoryFeedStateStore } from "../store/memory-feed-state-store";
import type {
  NostrTransport,
  NostrTransportEventPacket,
  NostrTransportFilter,
  NostrTransportSubscribeOptions,
} from "../transport/transport";
import { createNostrCoreQueryClient } from "./query-client";

const createFakeTransport = () => {
  const events$ = new Subject<NostrTransportEventPacket>();
  const close = vi.fn(() => events$.complete());
  const complete = vi.fn();
  const emit = vi.fn();
  const subscribe = vi.fn((_options: NostrTransportSubscribeOptions) => ({
    events$: events$.asObservable(),
    emit,
    complete,
    close,
  }));
  const transport = {
    setDefaultRelays: vi.fn(),
    subscribe,
    publish: vi.fn(),
    observeMessages: vi.fn(),
    observeConnectionState: vi.fn(),
    dispose: vi.fn(),
  } as unknown as NostrTransport;

  return { transport, events$, emit, complete, close, subscribe };
};

const createEvent = (overrides: Partial<NostrEvent> = {}): NostrEvent => ({
  id: "event-1",
  pubkey: "pubkey-1",
  kind: 1,
  content: "hello",
  tags: [],
  created_at: 1,
  sig: "sig",
  ...overrides,
});

describe("createNostrCoreQueryClient", () => {
  test("returns cached events without opening a transport subscription", async () => {
    const { transport, subscribe } = createFakeTransport();
    const repository = new MemoryNostrRepository();
    const event = createEvent();
    await repository.putEvent({ event, relay: "wss://relay.example" });
    const queryClient = createNostrCoreQueryClient({
      transport,
      repository,
    });

    await expect(queryClient.ensureEvent({ id: event.id })).resolves.toBe(
      event,
    );

    expect(subscribe).not.toHaveBeenCalled();
  });

  test("emits a backward id filter and closes the one-shot subscription after projecting an event", async () => {
    const { transport, events$, emit, close, subscribe } =
      createFakeTransport();
    const repository = new MemoryNostrRepository();
    const queryClient = createNostrCoreQueryClient({
      transport,
      repository,
      now: () => 123,
    });
    const event = createEvent();

    await expect(
      queryClient.ensureEvent({
        id: event.id,
        relays: ["wss://relay.example"],
      }),
    ).resolves.toBeUndefined();
    events$.next({
      type: "EVENT",
      from: "wss://relay.example",
      subId: "sub-1",
      event,
    });
    await vi.waitFor(() => {
      expect(close).toHaveBeenCalledOnce();
    });

    expect(subscribe).toHaveBeenCalledWith({
      filters: { ids: [event.id] },
      relays: ["wss://relay.example"],
      mode: "backward",
    });
    expect(emit).toHaveBeenCalledWith({ ids: [event.id] });
    expect(close).toHaveBeenCalledOnce();
    await expect(repository.getEvent(event.id)).resolves.toBe(event);
    expect(repository.eventStore.getEvent(event.id)).toBe(event);
    expect(repository.eventStore.getSeenRelays(event.id)).toEqual([
      "wss://relay.example",
    ]);
  });

  test("keeps relation subscriptions open for multiple matching events until timeout", async () => {
    vi.useFakeTimers();
    const { transport, events$, close } = createFakeTransport();
    const repository = new MemoryNostrRepository();
    const queryClient = createNostrCoreQueryClient({
      transport,
      repository,
      requestTimeoutMs: 25,
    });
    const first = createEvent({ id: "reply-1", tags: [["e", "root"]] });
    const second = createEvent({ id: "reply-2", tags: [["e", "root"]] });

    await expect(
      queryClient.ensureEventRelations({
        query: { kinds: [1], tags: { e: ["root"] } },
      }),
    ).resolves.toEqual([]);

    events$.next({
      type: "EVENT",
      from: "wss://relay.example",
      subId: "sub-1",
      event: first,
    });
    await vi.runAllTicks();
    await expect(repository.getEvent(first.id)).resolves.toBe(first);
    expect(close).not.toHaveBeenCalled();

    events$.next({
      type: "EVENT",
      from: "wss://relay.example",
      subId: "sub-1",
      event: second,
    });
    await vi.runAllTicks();
    await expect(repository.getEvent(second.id)).resolves.toBe(second);
    expect(close).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(25);
    expect(close).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });

  test("fetches a backward event page through transport and projects received events", async () => {
    const { transport, events$, emit, complete, close, subscribe } =
      createFakeTransport();
    const repository = new MemoryNostrRepository();
    const queryClient = createNostrCoreQueryClient({
      transport,
      repository,
      now: () => 456,
    });
    const event = createEvent({ id: "page-event" });
    const packet = {
      type: "EVENT",
      from: "wss://relay.example",
      subId: "sub-1",
      event,
    } as const;
    const resultPromise = queryClient.fetchEventPage({
      filter: { kinds: [1], limit: 20, until: 100 },
      relays: ["wss://relay.example"],
    });

    events$.next(packet);
    events$.complete();

    await expect(resultPromise).resolves.toEqual([packet]);
    expect(subscribe).toHaveBeenCalledWith({
      filters: { kinds: [1], limit: 20, until: 100 },
      relays: ["wss://relay.example"],
      mode: "backward",
    });
    expect(emit).toHaveBeenCalledWith({ kinds: [1], limit: 20, until: 100 });
    expect(complete).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
    await expect(repository.getEvent(event.id)).resolves.toBe(event);
    expect(repository.eventStore.getEvent(event.id)).toBe(event);
    expect(repository.eventStore.getSeenRelays(event.id)).toEqual([
      "wss://relay.example",
    ]);
  });

  test("deduplicates event page packets by event id while preserving the first relay source", async () => {
    const { transport, events$ } = createFakeTransport();
    const queryClient = createNostrCoreQueryClient({
      transport,
      repository: new MemoryNostrRepository(),
    });
    const event = createEvent({ id: "duplicated-page-event" });
    const firstPacket = {
      type: "EVENT",
      from: "wss://first-relay.example",
      subId: "sub-1",
      event,
    } as const;
    const secondPacket = {
      type: "EVENT",
      from: "wss://second-relay.example",
      subId: "sub-1",
      event,
    } as const;
    const resultPromise = queryClient.fetchEventPage({
      filter: { kinds: [1], limit: 20 },
    });

    events$.next(firstPacket);
    events$.next(secondPacket);
    events$.complete();

    await expect(resultPromise).resolves.toEqual([firstPacket]);
  });

  test("resolves an empty event page after the request timeout", async () => {
    vi.useFakeTimers();
    const { transport, close } = createFakeTransport();
    const queryClient = createNostrCoreQueryClient({
      transport,
      repository: new MemoryNostrRepository(),
      requestTimeoutMs: 25,
    });

    const resultPromise = queryClient.fetchEventPage({
      filter: { kinds: [1], limit: 20 },
    });

    await vi.advanceTimersByTimeAsync(25);

    await expect(resultPromise).resolves.toEqual([]);
    expect(close).toHaveBeenCalledOnce();
    queryClient.dispose();
    expect(close).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });

  test("closes a missing profile one-shot subscription after the request timeout", async () => {
    vi.useFakeTimers();
    const { transport, emit, close, subscribe } = createFakeTransport();
    const queryClient = createNostrCoreQueryClient({
      transport,
      repository: new MemoryNostrRepository(),
      requestTimeoutMs: 25,
    });

    await expect(
      queryClient.ensureProfile({
        pubkey: "pubkey-1",
        relays: ["wss://relay.example"],
      }),
    ).resolves.toBeUndefined();

    expect(subscribe).toHaveBeenCalledWith({
      filters: { authors: ["pubkey-1"], kinds: [0], limit: 1 },
      relays: ["wss://relay.example"],
      mode: "backward",
    });
    expect(emit).toHaveBeenCalledWith({
      authors: ["pubkey-1"],
      kinds: [0],
      limit: 1,
    } satisfies NostrTransportFilter);
    expect(close).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(25);
    expect(close).toHaveBeenCalledOnce();
    queryClient.dispose();
    expect(close).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });

  test("exposes a debug snapshot for registered feeds, query subscriptions, and store state", async () => {
    const { transport } = createFakeTransport();
    const repository = new MemoryNostrRepository();
    const feedStateStore = new MemoryFeedStateStore();
    const queryClient = createNostrCoreQueryClient({
      transport,
      repository,
      feedStateStore,
      now: () => 1_000,
    });

    expect(queryClient.getSnapshot()).toMatchObject({
      queryRegistry: {
        activeSubscriptionCount: 0,
        subscriptions: [],
      },
      eventStore: {
        eventCount: 0,
      },
      feedStateStore: {
        feeds: [],
      },
      feeds: [],
    });

    queryClient.ensureEventFeed({
      id: "feed:user:pubkey-1",
      filters: { authors: ["pubkey-1"], kinds: [1], limit: 20 },
      strategy: "liveBackfill",
      relays: ["wss://relay.example"],
    });

    expect(queryClient.getSnapshot()).toMatchObject({
      queryRegistry: {
        activeSubscriptionCount: 1,
      },
      feedStateStore: {
        feeds: [
          {
            feedId: "feed:user:pubkey-1",
            status: "loading",
            activeRelays: ["wss://relay.example"],
          },
        ],
      },
      feeds: [
        {
          feedId: "feed:user:pubkey-1",
          hasLiveSubscription: true,
          definition: {
            strategy: "liveBackfill",
          },
        },
      ],
    });
  });

  test("ensures a liveBackfill event feed with a forward subscription and feed item projection", async () => {
    const { transport, events$, emit, close, subscribe } =
      createFakeTransport();
    const repository = new MemoryNostrRepository();
    const feedStateStore = new MemoryFeedStateStore();
    const queryClient = createNostrCoreQueryClient({
      transport,
      repository,
      feedStateStore,
      now: () => 1_000,
    });
    const event = createEvent({ id: "live-event", created_at: 200 });

    queryClient.ensureEventFeed({
      id: "feed:user:pubkey-1",
      filters: { authors: ["pubkey-1"], kinds: [1], limit: 20 },
      strategy: "liveBackfill",
      relays: ["wss://relay.example"],
    });
    events$.next({
      type: "EVENT",
      from: "wss://relay.example",
      subId: "sub-1",
      event,
    });

    await vi.waitFor(() => {
      expect(feedStateStore.getSnapshot("feed:user:pubkey-1")).toMatchObject({
        eventIds: ["live-event"],
        status: "live",
        newestCreatedAt: 200,
        oldestCreatedAt: 200,
      });
    });
    expect(subscribe).toHaveBeenCalledWith({
      filters: { authors: ["pubkey-1"], kinds: [1], limit: 20, since: 1 },
      relays: ["wss://relay.example"],
      mode: "forward",
    });
    expect(emit).toHaveBeenCalledWith({
      authors: ["pubkey-1"],
      kinds: [1],
      limit: 20,
      since: 1,
    });
    expect(feedStateStore.getSnapshot("feed:user:pubkey-1")).toMatchObject({
      feedId: "feed:user:pubkey-1",
      status: "live",
      newestCreatedAt: 200,
      oldestCreatedAt: 200,
    });
    expect(close).not.toHaveBeenCalled();

    queryClient.stopEventFeed("feed:user:pubkey-1");
    expect(close).toHaveBeenCalledOnce();
    await expect(repository.getEvent(event.id)).resolves.toBe(event);
  });

  test("fetches more event feed rows with until cursor and closes the backward request", async () => {
    const { transport, events$, emit, complete, close, subscribe } =
      createFakeTransport();
    const repository = new MemoryNostrRepository();
    const feedStateStore = new MemoryFeedStateStore();
    const queryClient = createNostrCoreQueryClient({
      transport,
      repository,
      feedStateStore,
      now: () => 2_000,
    });
    const event = createEvent({ id: "backfill-event", created_at: 99 });

    queryClient.ensureEventFeed({
      id: "feed:user:pubkey-1",
      filters: { authors: ["pubkey-1"], kinds: [1] },
      strategy: "liveBackfill",
      limit: 20,
    });
    feedStateStore.addItem(
      "feed:user:pubkey-1",
      createEvent({
        id: "cursor-event",
        created_at: 99,
      }),
    );
    feedStateStore.setStatus("feed:user:pubkey-1", "live", {
      hasMoreBackfill: true,
    });
    const resultPromise = queryClient.fetchMoreEventFeed("feed:user:pubkey-1");
    events$.next({
      type: "EVENT",
      from: "wss://relay.example",
      subId: "sub-2",
      event,
    });
    events$.complete();

    await expect(resultPromise).resolves.toHaveLength(1);
    expect(subscribe).toHaveBeenLastCalledWith({
      filters: { authors: ["pubkey-1"], kinds: [1], limit: 20, until: 98 },
      relays: undefined,
      mode: "backward",
    });
    expect(emit).toHaveBeenLastCalledWith({
      authors: ["pubkey-1"],
      kinds: [1],
      limit: 20,
      until: 98,
    });
    expect(complete).toHaveBeenCalled();
    expect(close).toHaveBeenCalled();
    await vi.waitFor(() => {
      expect(feedStateStore.getSnapshot("feed:user:pubkey-1")).toMatchObject({
        eventIds: ["cursor-event", "backfill-event"],
        hasMoreBackfill: false,
        oldestCreatedAt: 99,
        newestCreatedAt: 99,
      });
    });
  });

  test("marks backfill complete after an empty event feed page", async () => {
    const { transport, events$, close } = createFakeTransport();
    const feedStateStore = new MemoryFeedStateStore();
    const queryClient = createNostrCoreQueryClient({
      transport,
      repository: new MemoryNostrRepository(),
      feedStateStore,
      now: () => 3_000,
    });

    queryClient.ensureEventFeed({
      id: "feed:empty",
      filters: { kinds: [1] },
      strategy: "liveBackfill",
      limit: 20,
    });
    feedStateStore.addItem(
      "feed:empty",
      createEvent({ id: "older", created_at: 99 }),
    );
    feedStateStore.addItem(
      "feed:empty",
      createEvent({ id: "newer", created_at: 120 }),
    );
    feedStateStore.setStatus("feed:empty", "live", { hasMoreBackfill: true });

    const resultPromise = queryClient.fetchMoreEventFeed("feed:empty");
    events$.complete();

    await expect(resultPromise).resolves.toEqual([]);
    expect(close).toHaveBeenCalled();
    expect(feedStateStore.getSnapshot("feed:empty")).toMatchObject({
      hasMoreBackfill: false,
      oldestCreatedAt: 99,
      newestCreatedAt: 120,
    });
  });

  test("settles fetchMore when pagination state persistence fails", async () => {
    const { transport, events$, close } = createFakeTransport();
    const feedStateStore = new MemoryFeedStateStore();
    const queryClient = createNostrCoreQueryClient({
      transport,
      repository: new MemoryNostrRepository(),
      feedStateStore,
    });

    queryClient.ensureEventFeed({
      id: "feed:persistence-error",
      filters: { kinds: [1] },
      strategy: "liveBackfill",
      limit: 20,
    });
    feedStateStore.addItem(
      "feed:persistence-error",
      createEvent({
        id: "cursor-event",
        created_at: 99,
      }),
    );
    feedStateStore.setStatus("feed:persistence-error", "live", {
      hasMoreBackfill: true,
    });

    const resultPromise = queryClient.fetchMoreEventFeed(
      "feed:persistence-error",
    );
    events$.complete();

    await expect(resultPromise).resolves.toEqual([]);
    expect(close).toHaveBeenCalled();
  });
});
