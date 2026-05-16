import type { NostrEvent } from "nostr-tools";
import { Subject } from "rxjs";
import { describe, expect, test, vi } from "vitest";
import type {
  NostrTransport,
  NostrTransportEventPacket,
  NostrTransportSubscribeOptions,
} from "../transport/transport";
import { createQueryRegistry } from "./query-registry";

const createFakeTransport = () => {
  const events$ = new Subject<NostrTransportEventPacket>();
  const close = vi.fn();
  const complete = vi.fn(() => events$.complete());
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

const event = (id: string): NostrEvent => ({
  id,
  pubkey: "pubkey-1",
  kind: 1,
  content: "hello",
  tags: [],
  created_at: 1,
  sig: "sig",
});

describe("QueryRegistry", () => {
  test("opens a one-shot backward subscription, emits its filter, and closes after the first event", async () => {
    const { transport, events$, emit, close, subscribe } =
      createFakeTransport();
    const packets: NostrTransportEventPacket[] = [];
    const registry = createQueryRegistry({ transport, requestTimeoutMs: 25 });

    registry.open({
      options: {
        filters: { ids: ["event-1"] },
        relays: ["wss://relay.example"],
        mode: "backward",
      },
      closeOnFirstEvent: true,
      onEvent: (packet) => packets.push(packet),
    });
    const packet = {
      type: "EVENT",
      from: "wss://relay.example",
      subId: "sub-1",
      event: event("event-1"),
    } as const;
    events$.next(packet);

    await vi.waitFor(() => {
      expect(close).toHaveBeenCalledOnce();
    });
    expect(subscribe).toHaveBeenCalledWith({
      filters: { ids: ["event-1"] },
      relays: ["wss://relay.example"],
      mode: "backward",
    });
    expect(emit).toHaveBeenCalledWith({ ids: ["event-1"] });
    expect(packets).toEqual([packet]);
  });

  test("closes backward subscriptions on timeout when no event arrives", async () => {
    vi.useFakeTimers();
    const { transport, close } = createFakeTransport();
    const registry = createQueryRegistry({ transport, requestTimeoutMs: 25 });

    registry.open({
      options: { filters: { kinds: [1] }, mode: "backward" },
      closeOnFirstEvent: false,
      onEvent: vi.fn(),
    });

    expect(close).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(25);
    expect(close).toHaveBeenCalledOnce();
    registry.dispose();
    expect(close).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });

  test("keeps forward subscriptions open until their handle is closed", () => {
    const { transport, close } = createFakeTransport();
    const registry = createQueryRegistry({ transport, requestTimeoutMs: 25 });

    const handle = registry.open({
      options: { filters: { kinds: [1] }, mode: "forward" },
      closeOnFirstEvent: false,
      onEvent: vi.fn(),
    });

    expect(close).not.toHaveBeenCalled();
    handle.close();
    expect(close).toHaveBeenCalledOnce();
    registry.dispose();
    expect(close).toHaveBeenCalledOnce();
  });

  test("dedupes equivalent filters and fans out events to each listener", () => {
    const { transport, events$, emit, close, subscribe } =
      createFakeTransport();
    const registry = createQueryRegistry({ transport, requestTimeoutMs: 25 });
    const firstPackets: string[] = [];
    const secondPackets: string[] = [];

    const first = registry.open({
      options: {
        filters: {
          kinds: [1, 0],
          authors: ["b", "a"],
          "#p": ["p2", "p1"],
          "#a": ["a2", "a1"],
        },
        relays: ["wss://relay-b.example", "wss://relay-a.example"],
        mode: "forward",
      },
      onEvent: (packet) => firstPackets.push(packet.event.id),
    });
    const second = registry.open({
      options: {
        filters: {
          authors: ["a", "b"],
          kinds: [0, 1],
          "#a": ["a1", "a2"],
          "#p": ["p1", "p2"],
        },
        relays: ["wss://relay-a.example", "wss://relay-b.example"],
        mode: "forward",
      },
      onEvent: (packet) => secondPackets.push(packet.event.id),
    });

    const packet = {
      type: "EVENT",
      from: "wss://relay-a.example",
      subId: "sub-1",
      event: event("event-1"),
    } as const;
    events$.next(packet);

    expect(subscribe).toHaveBeenCalledOnce();
    expect(emit).toHaveBeenCalledOnce();
    expect(firstPackets).toEqual(["event-1"]);
    expect(secondPackets).toEqual(["event-1"]);

    first.close();
    expect(close).not.toHaveBeenCalled();
    second.close();
    expect(close).toHaveBeenCalledOnce();
  });

  test("does not dedupe backward requests so late request callers cannot miss already delivered events", () => {
    const { transport, close, subscribe } = createFakeTransport();
    const registry = createQueryRegistry({ transport, requestTimeoutMs: 25 });

    const first = registry.open({
      options: { filters: { ids: ["event-1"] }, mode: "backward" },
      closeAfterMs: undefined,
      onEvent: vi.fn(),
    });
    const second = registry.open({
      options: { filters: { ids: ["event-1"] }, mode: "backward" },
      closeAfterMs: undefined,
      onEvent: vi.fn(),
    });

    expect(subscribe).toHaveBeenCalledTimes(2);
    first.close();
    expect(close).toHaveBeenCalledOnce();
    second.close();
    expect(close).toHaveBeenCalledTimes(2);
  });

  test("does not miss events emitted synchronously during the initial transport emit", () => {
    const events$ = new Subject<NostrTransportEventPacket>();
    const packet = {
      type: "EVENT",
      from: "wss://relay.example",
      subId: "sub-1",
      event: event("event-1"),
    } as const;
    const close = vi.fn(() => events$.complete());
    const complete = vi.fn(() => events$.complete());
    const emit = vi.fn(() => events$.next(packet));
    const subscribe = vi.fn(() => ({
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
    const registry = createQueryRegistry({ transport, requestTimeoutMs: 25 });
    const packets: string[] = [];

    registry.open({
      options: { filters: { ids: ["event-1"] }, mode: "backward" },
      onEvent: (transportPacket) => packets.push(transportPacket.event.id),
    });

    expect(packets).toEqual(["event-1"]);
  });

  test("removes completed shared subscriptions so future opens create a fresh transport subscription", () => {
    const { transport, events$, subscribe } = createFakeTransport();
    const registry = createQueryRegistry({ transport, requestTimeoutMs: 25 });
    const completed = vi.fn();

    registry.open({
      options: { filters: { ids: ["event-1"] }, mode: "backward" },
      onEvent: vi.fn(),
      onComplete: completed,
    });
    events$.complete();
    registry.open({
      options: { filters: { ids: ["event-1"] }, mode: "backward" },
      onEvent: vi.fn(),
    });

    expect(completed).toHaveBeenCalledOnce();
    expect(subscribe).toHaveBeenCalledTimes(2);
  });

  test("does not dedupe queries with different default read relay policy", () => {
    const { transport, subscribe } = createFakeTransport();
    const registry = createQueryRegistry({ transport, requestTimeoutMs: 25 });

    registry.open({
      options: {
        filters: { kinds: [1] },
        mode: "forward",
        defaultReadRelays: false,
      },
      onEvent: vi.fn(),
    });
    registry.open({
      options: {
        filters: { kinds: [1] },
        mode: "forward",
        defaultReadRelays: true,
      },
      onEvent: vi.fn(),
    });

    expect(subscribe).toHaveBeenCalledTimes(2);
  });

  test("isolates throwing listeners while preserving fan-out and cleanup", () => {
    const { transport, events$, close } = createFakeTransport();
    const registry = createQueryRegistry({ transport, requestTimeoutMs: 25 });
    const received: string[] = [];

    registry.open({
      options: { filters: { kinds: [1] }, mode: "forward" },
      closeOnFirstEvent: true,
      onEvent: () => {
        throw new Error("listener failed");
      },
    });
    registry.open({
      options: { filters: { kinds: [1] }, mode: "forward" },
      closeOnFirstEvent: true,
      onEvent: (packet) => received.push(packet.event.id),
    });

    events$.next({
      type: "EVENT",
      from: "wss://relay.example",
      subId: "sub-1",
      event: event("event-1"),
    });

    expect(received).toEqual(["event-1"]);
    expect(close).toHaveBeenCalledOnce();
  });

  test("complete is per-listener for shared forward subscriptions", () => {
    const { transport, events$, close, complete } = createFakeTransport();
    const registry = createQueryRegistry({ transport, requestTimeoutMs: 25 });
    const firstPackets: string[] = [];
    const secondPackets: string[] = [];

    const first = registry.open({
      options: { filters: { kinds: [1] }, mode: "forward" },
      onEvent: (packet) => firstPackets.push(packet.event.id),
    });
    registry.open({
      options: { filters: { kinds: [1] }, mode: "forward" },
      onEvent: (packet) => secondPackets.push(packet.event.id),
    });

    first.complete();
    events$.next({
      type: "EVENT",
      from: "wss://relay.example",
      subId: "sub-1",
      event: event("event-1"),
    });

    expect(complete).not.toHaveBeenCalled();
    expect(close).not.toHaveBeenCalled();
    expect(firstPackets).toEqual([]);
    expect(secondPackets).toEqual(["event-1"]);
  });

  test("uses per-listener forward timeouts instead of first-opener timeout", async () => {
    vi.useFakeTimers();
    const { transport, close } = createFakeTransport();
    const registry = createQueryRegistry({ transport, requestTimeoutMs: 25 });

    registry.open({
      options: { filters: { kinds: [1] }, mode: "forward" },
      closeAfterMs: 10,
      onEvent: vi.fn(),
    });
    registry.open({
      options: { filters: { kinds: [1] }, mode: "forward" },
      closeAfterMs: 20,
      onEvent: vi.fn(),
    });

    await vi.advanceTimersByTimeAsync(10);
    expect(close).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(10);
    expect(close).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });

  test("does not dedupe lazy time-dependent filters", () => {
    const { transport, subscribe } = createFakeTransport();
    const registry = createQueryRegistry({ transport, requestTimeoutMs: 25 });

    registry.open({
      options: { filters: { kinds: [1], since: () => 1 }, mode: "forward" },
      onEvent: vi.fn(),
    });
    registry.open({
      options: { filters: { kinds: [1], since: () => 1 }, mode: "forward" },
      onEvent: vi.fn(),
    });

    expect(subscribe).toHaveBeenCalledTimes(2);
  });

  test("disposes all active shared subscriptions idempotently", () => {
    const { transport, close } = createFakeTransport();
    const registry = createQueryRegistry({ transport, requestTimeoutMs: 25 });

    registry.open({
      options: { filters: { kinds: [1] }, mode: "backward" },
      closeOnFirstEvent: false,
      onEvent: vi.fn(),
    });
    registry.open({
      options: { filters: { kinds: [1] }, mode: "backward" },
      closeOnFirstEvent: false,
      onEvent: vi.fn(),
    });
    registry.open({
      options: { filters: { kinds: [0] }, mode: "forward" },
      closeOnFirstEvent: false,
      onEvent: vi.fn(),
    });

    registry.dispose();
    registry.dispose();

    expect(close).toHaveBeenCalledTimes(3);
  });
});
