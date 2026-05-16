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

  test("disposes all active subscriptions", () => {
    const { transport, close } = createFakeTransport();
    const registry = createQueryRegistry({ transport, requestTimeoutMs: 25 });

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

    expect(close).toHaveBeenCalledTimes(2);
  });
});
