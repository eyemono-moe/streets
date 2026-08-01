import { describe, expect, it, vi } from "vitest";
import type { NostrEvent } from "../nostr/event";
import { FakeRelayConnection } from "./fake-relay-connection";

const event = (id: string): NostrEvent => ({
  id,
  pubkey: "alice",
  created_at: 100,
  kind: 1,
  tags: [],
  content: id,
  sig: `${id}-sig`,
});

describe("FakeRelayConnection", () => {
  it("records the filters each subscription was opened with", () => {
    const relay = new FakeRelayConnection("wss://fake");

    relay.subscribe([{ kinds: [1], limit: 20 }], {
      onEvent: vi.fn(),
      onEose: vi.fn(),
      onClosed: vi.fn(),
    });

    expect(relay.subscriptions).toHaveLength(1);
    expect(relay.subscriptions[0].filters).toEqual([{ kinds: [1], limit: 20 }]);
    expect(relay.subscriptions[0].closed).toBe(false);
  });

  it("delivers events and eose only to the targeted subscription", () => {
    const relay = new FakeRelayConnection("wss://fake");
    const first = { onEvent: vi.fn(), onEose: vi.fn(), onClosed: vi.fn() };
    const second = { onEvent: vi.fn(), onEose: vi.fn(), onClosed: vi.fn() };

    relay.subscribe([{ kinds: [1] }], first);
    relay.subscribe([{ kinds: [7] }], second);

    relay.emitEvent(0, event("note-1"));
    relay.emitEose(0);

    expect(first.onEvent).toHaveBeenCalledWith(event("note-1"));
    expect(first.onEose).toHaveBeenCalledTimes(1);
    expect(second.onEvent).not.toHaveBeenCalled();
    expect(second.onEose).not.toHaveBeenCalled();
  });

  it("stops delivering after the subscription is closed", () => {
    const relay = new FakeRelayConnection("wss://fake");
    const handlers = { onEvent: vi.fn(), onEose: vi.fn(), onClosed: vi.fn() };

    const sub = relay.subscribe([{ kinds: [1] }], handlers);
    sub.close();
    relay.emitEvent(0, event("note-1"));

    expect(relay.subscriptions[0].closed).toBe(true);
    expect(handlers.onEvent).not.toHaveBeenCalled();
  });

  it("reports published events in order", async () => {
    const relay = new FakeRelayConnection("wss://fake");

    await relay.publish(event("note-1"));
    await relay.publish(event("note-2"));

    expect(relay.published.map((e) => e.id)).toEqual(["note-1", "note-2"]);
  });

  it("die() notifies onClose and closes every subscription", () => {
    const connection = new FakeRelayConnection("wss://one/");
    const closed: string[] = [];
    connection.onClose(() => closed.push("pool"));
    connection.subscribe([{ kinds: [1] }], {
      onEvent: () => {},
      onEose: () => {},
      onClosed: (reason) => closed.push(`sub:${reason}`),
    });

    connection.die();

    expect(closed).toEqual(["sub:socket closed", "pool"]);
    expect(connection.closed).toBe(true);
  });
});
