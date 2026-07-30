import { describe, expect, it, vi } from "vitest";
import type { NostrEvent } from "../nostr/event";
import {
  type WebSocketLike,
  WebSocketRelayConnection,
} from "./websocket-relay-connection";

const event = (id: string): NostrEvent => ({
  id,
  pubkey: "alice",
  created_at: 100,
  kind: 1,
  tags: [],
  content: id,
  sig: "sig",
});

const fakeSocket = () => {
  const sent: string[] = [];
  const socket: WebSocketLike = {
    readyState: 0,
    send: (data: string) => sent.push(data),
    close: vi.fn(),
    onopen: null,
    onmessage: null,
    onclose: null,
    onerror: null,
  };
  return {
    socket,
    sent,
    open: () => {
      socket.readyState = 1;
      socket.onopen?.();
    },
    receive: (message: unknown) =>
      socket.onmessage?.({ data: JSON.stringify(message) }),
  };
};

describe("WebSocketRelayConnection", () => {
  it("buffers REQ until the socket opens, then sends it", () => {
    const { socket, sent, open } = fakeSocket();
    const connection = new WebSocketRelayConnection("wss://a", socket);

    connection.subscribe([{ kinds: [1], limit: 5 }], {
      onEvent: vi.fn(),
      onEose: vi.fn(),
      onClosed: vi.fn(),
    });
    expect(sent).toHaveLength(0);

    open();

    expect(sent).toHaveLength(1);
    const message = JSON.parse(sent[0]);
    expect(message[0]).toBe("REQ");
    expect(typeof message[1]).toBe("string");
    expect(message[2]).toEqual({ kinds: [1], limit: 5 });
  });

  it("routes EVENT and EOSE to the matching subscription only", () => {
    const { socket, sent, open, receive } = fakeSocket();
    const connection = new WebSocketRelayConnection("wss://a", socket);
    const first = { onEvent: vi.fn(), onEose: vi.fn(), onClosed: vi.fn() };
    const second = { onEvent: vi.fn(), onEose: vi.fn(), onClosed: vi.fn() };

    connection.subscribe([{ kinds: [1] }], first);
    connection.subscribe([{ kinds: [7] }], second);
    open();

    const firstSubId = JSON.parse(sent[0])[1];
    receive(["EVENT", firstSubId, event("note-1")]);
    receive(["EOSE", firstSubId]);

    expect(first.onEvent).toHaveBeenCalledWith(event("note-1"));
    expect(first.onEose).toHaveBeenCalledTimes(1);
    expect(second.onEvent).not.toHaveBeenCalled();
  });

  it("reports CLOSED with the relay's reason", () => {
    const { socket, sent, open, receive } = fakeSocket();
    const connection = new WebSocketRelayConnection("wss://a", socket);
    const handlers = { onEvent: vi.fn(), onEose: vi.fn(), onClosed: vi.fn() };

    connection.subscribe([{ kinds: [1] }], handlers);
    open();
    receive(["CLOSED", JSON.parse(sent[0])[1], "blocked: pubkey banned"]);

    expect(handlers.onClosed).toHaveBeenCalledWith("blocked: pubkey banned");
  });

  it("reports the socket closing as a closed subscription", () => {
    const { socket, open } = fakeSocket();
    const connection = new WebSocketRelayConnection("wss://a", socket);
    const handlers = { onEvent: vi.fn(), onEose: vi.fn(), onClosed: vi.fn() };

    connection.subscribe([{ kinds: [1] }], handlers);
    open();
    socket.onclose?.();

    expect(handlers.onClosed).toHaveBeenCalledWith("socket closed");
  });

  it("sends CLOSE when a subscription is closed", () => {
    const { socket, sent, open } = fakeSocket();
    const connection = new WebSocketRelayConnection("wss://a", socket);

    const sub = connection.subscribe([{ kinds: [1] }], {
      onEvent: vi.fn(),
      onEose: vi.fn(),
      onClosed: vi.fn(),
    });
    open();
    const subId = JSON.parse(sent[0])[1];
    sub.close();

    expect(JSON.parse(sent[1])).toEqual(["CLOSE", subId]);
  });

  it("ignores malformed messages instead of throwing", () => {
    const { socket, open } = fakeSocket();
    const connection = new WebSocketRelayConnection("wss://a", socket);
    connection.subscribe([{ kinds: [1] }], {
      onEvent: vi.fn(),
      onEose: vi.fn(),
      onClosed: vi.fn(),
    });
    open();

    expect(() => socket.onmessage?.({ data: "not json" })).not.toThrow();
    expect(() => socket.onmessage?.({ data: "{}" })).not.toThrow();
  });

  it("resolves publish when the relay accepts the event", async () => {
    const { socket, open, receive } = fakeSocket();
    const connection = new WebSocketRelayConnection("wss://a", socket);
    open();

    const published = connection.publish(event("note-1"));
    receive(["OK", "note-1", true, ""]);

    await expect(published).resolves.toBeUndefined();
  });

  it("rejects publish when the relay refuses the event", async () => {
    const { socket, open, receive } = fakeSocket();
    const connection = new WebSocketRelayConnection("wss://a", socket);
    open();

    const published = connection.publish(event("note-1"));
    receive(["OK", "note-1", false, "invalid: bad signature"]);

    await expect(published).rejects.toThrow("invalid: bad signature");
  });
});
