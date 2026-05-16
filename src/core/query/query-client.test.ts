import type { NostrEvent } from "nostr-tools";
import { Subject } from "rxjs";
import { describe, expect, test, vi } from "vitest";
import { createNostrCollections } from "../db/collections";
import { MemoryNostrRepository } from "../repository/memory-repository";
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
    const collections = createNostrCollections();
    const event = createEvent();
    await repository.putEvent({ event, relay: "wss://relay.example" });
    const queryClient = createNostrCoreQueryClient({
      transport,
      repository,
      collections,
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
    const collections = createNostrCollections();
    const queryClient = createNostrCoreQueryClient({
      transport,
      repository,
      collections,
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
    expect(await collections.events.get(event.id)).toMatchObject({
      id: event.id,
      receivedAt: 123,
      seenRelays: ["wss://relay.example"],
    });
  });

  test("keeps relation subscriptions open for multiple matching events until timeout", async () => {
    vi.useFakeTimers();
    const { transport, events$, close } = createFakeTransport();
    const repository = new MemoryNostrRepository();
    const collections = createNostrCollections();
    const queryClient = createNostrCoreQueryClient({
      transport,
      repository,
      collections,
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
    const collections = createNostrCollections();
    const queryClient = createNostrCoreQueryClient({
      transport,
      repository,
      collections,
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
    expect(await collections.events.get(event.id)).toMatchObject({
      id: event.id,
      receivedAt: 456,
      seenRelays: ["wss://relay.example"],
    });
  });

  test("deduplicates event page packets by event id while preserving the first relay source", async () => {
    const { transport, events$ } = createFakeTransport();
    const queryClient = createNostrCoreQueryClient({
      transport,
      repository: new MemoryNostrRepository(),
      collections: createNostrCollections(),
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
      collections: createNostrCollections(),
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
      collections: createNostrCollections(),
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
});
