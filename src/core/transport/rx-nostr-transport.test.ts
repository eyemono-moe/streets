import type { RxNostr } from "rx-nostr";
import { Observable, Subject, of } from "rxjs";
import { describe, expect, test, vi } from "vitest";
import { RxNostrTransport } from "./rx-nostr-transport";
import type { NostrSubscription } from "./transport";

const createFakeRxNostr = () => {
  const allMessages$ = new Subject<unknown>();
  const connectionState$ = new Subject<unknown>();
  const useResult$ = new Subject<unknown>();

  const rxNostr = {
    setDefaultRelays: vi.fn(),
    use: vi.fn(() => useResult$.asObservable()),
    send: vi.fn(() => of({ ok: true, done: true })),
    createAllMessageObservable: vi.fn(() => allMessages$.asObservable()),
    createConnectionStateObservable: vi.fn(() =>
      connectionState$.asObservable(),
    ),
    dispose: vi.fn(),
  } as unknown as RxNostr;

  return { rxNostr, allMessages$, connectionState$, useResult$ };
};

describe("RxNostrTransport", () => {
  test("sets default relays through the wrapped rx-nostr instance", () => {
    const { rxNostr } = createFakeRxNostr();
    const transport = new RxNostrTransport(rxNostr);

    transport.setDefaultRelays(["wss://relay.example"]);

    expect(rxNostr.setDefaultRelays).toHaveBeenCalledWith([
      "wss://relay.example",
    ]);
  });

  test("creates backward subscriptions without exposing rx-nostr to callers", () => {
    const { rxNostr } = createFakeRxNostr();
    const transport = new RxNostrTransport(rxNostr);

    const subscription = transport.subscribe({
      filters: { kinds: [1], limit: 10, "#a": ["kind:pubkey:d"] },
      relays: ["wss://relay.example"],
      mode: "backward",
    });

    expect(rxNostr.use).toHaveBeenCalledOnce();
    expect(rxNostr.use).toHaveBeenCalledWith(expect.anything(), {
      on: {
        relays: ["wss://relay.example"],
        defaultReadRelays: false,
      },
    });

    subscription.emit({ kinds: [1], limit: 10, "#a": ["kind:pubkey:d"] });
    subscription.close();
  });

  test("closes subscriptions by unsubscribing observed rx-nostr streams", () => {
    const unsubscribe = vi.fn();
    const rxNostr = {
      setDefaultRelays: vi.fn(),
      use: vi.fn(
        () =>
          new Observable(() => {
            return unsubscribe;
          }),
      ),
      send: vi.fn(),
      createAllMessageObservable: vi.fn(),
      createConnectionStateObservable: vi.fn(),
      dispose: vi.fn(),
    } as unknown as RxNostr;
    const transport = new RxNostrTransport(rxNostr);
    const subscription = transport.subscribe({
      filters: { kinds: [1] },
      mode: "forward",
    });

    const observableSubscription = subscription.events$.subscribe();
    subscription.close();

    expect(unsubscribe).toHaveBeenCalledOnce();
    expect(observableSubscription.closed).toBe(true);
  });

  test("passes publish requests to rx-nostr send", () => {
    const { rxNostr } = createFakeRxNostr();
    const transport = new RxNostrTransport(rxNostr);

    const event = {
      kind: 1,
      content: "hello",
      tags: [],
      created_at: 1,
    };

    const results: unknown[] = [];
    transport
      .publish(event, { relays: ["wss://relay.example"] })
      .subscribe((packet) => {
        results.push(packet);
      });

    expect(rxNostr.send).toHaveBeenCalledWith(event, {
      on: {
        relays: ["wss://relay.example"],
        defaultWriteRelays: false,
      },
    });
    expect(results).toEqual([{ ok: true, done: true }]);
  });

  test("exposes observation streams and dispose without leaking rx-nostr", () => {
    const { rxNostr, allMessages$, connectionState$ } = createFakeRxNostr();
    const transport = new RxNostrTransport(rxNostr);

    const messages: unknown[] = [];
    const states: unknown[] = [];
    transport.observeMessages().subscribe((packet) => messages.push(packet));
    transport
      .observeConnectionState()
      .subscribe((packet) => states.push(packet));

    allMessages$.next({
      type: "NOTICE",
      from: "wss://relay.example",
      notice: "hi",
    });
    connectionState$.next({ from: "wss://relay.example", state: "connected" });
    transport.dispose();

    expect(messages).toEqual([
      { type: "NOTICE", from: "wss://relay.example", notice: "hi" },
    ]);
    expect(states).toEqual([
      { from: "wss://relay.example", state: "connected" },
    ]);
    expect(rxNostr.dispose).toHaveBeenCalledOnce();
  });
});

expectType<NostrSubscription>(undefined as never);

function expectType<T>(_value: T) {}
