import { describe, expect, it, vi } from "vite-plus/test";
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
    // Real WebSocket flips readyState to CLOSING synchronously on .close(), well before async onclose fires (mirrored here).
    close: vi.fn(() => {
      socket.readyState = 2;
    }),
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

  it("reports subscribe as closed instead of hanging once the socket has closed", () => {
    const { socket, open } = fakeSocket();
    const connection = new WebSocketRelayConnection("wss://a", socket);
    open();
    socket.onclose?.();

    const handlers = { onEvent: vi.fn(), onEose: vi.fn(), onClosed: vi.fn() };
    connection.subscribe([{ kinds: [1] }], handlers);

    expect(handlers.onClosed).toHaveBeenCalledWith("socket closed");
  });

  it("rejects publish instead of hanging once the socket has closed", async () => {
    const { socket, open } = fakeSocket();
    const connection = new WebSocketRelayConnection("wss://a", socket);
    open();
    socket.onclose?.();

    const published = connection.publish(event("note-1"));

    await expect(published).rejects.toThrow("socket closed");
  });

  it("settles every pending publish for the same event id when OK arrives", async () => {
    const { socket, open, receive } = fakeSocket();
    const connection = new WebSocketRelayConnection("wss://a", socket);
    open();

    const first = connection.publish(event("note-1"));
    const second = connection.publish(event("note-1"));
    receive(["OK", "note-1", true, ""]);

    await expect(first).resolves.toBeUndefined();
    await expect(second).resolves.toBeUndefined();
  });

  it("rejects publish when OK's ok field is a truthy non-boolean value", async () => {
    const { socket, open, receive } = fakeSocket();
    const connection = new WebSocketRelayConnection("wss://a", socket);
    open();

    const published = connection.publish(event("note-1"));
    // A malformed relay response: "false" is a non-empty string, so it's truthy in JS even though the relay means "not ok".
    receive(["OK", "note-1", "false", "invalid: bad signature"]);

    await expect(published).rejects.toThrow();
  });

  it("does not hang when subscribe/publish is called synchronously after close()", async () => {
    const { socket, open } = fakeSocket();
    const connection = new WebSocketRelayConnection("wss://a", socket);
    open();

    connection.close();
    // socket.onclose hasn't fired yet (async on a real WebSocket), but readyState already reflects CLOSING synchronously.

    const handlers = { onEvent: vi.fn(), onEose: vi.fn(), onClosed: vi.fn() };
    connection.subscribe([{ kinds: [1] }], handlers);
    expect(handlers.onClosed).toHaveBeenCalledWith("socket closed");

    const published = connection.publish(event("note-1"));
    await expect(published).rejects.toThrow("socket closed");
  });

  it("ignores an EVENT message whose event payload is missing", () => {
    const { socket, sent, open, receive } = fakeSocket();
    const connection = new WebSocketRelayConnection("wss://a", socket);
    const handlers = { onEvent: vi.fn(), onEose: vi.fn(), onClosed: vi.fn() };
    connection.subscribe([{ kinds: [1] }], handlers);
    open();
    const subId = JSON.parse(sent[0])[1];

    expect(() => receive(["EVENT", subId])).not.toThrow();

    expect(handlers.onEvent).not.toHaveBeenCalled();
  });

  it("ignores an EVENT message with a non-string subscription id", () => {
    const { socket, open, receive } = fakeSocket();
    const connection = new WebSocketRelayConnection("wss://a", socket);
    const handlers = { onEvent: vi.fn(), onEose: vi.fn(), onClosed: vi.fn() };
    connection.subscribe([{ kinds: [1] }], handlers);
    open();

    expect(() => receive(["EVENT", 5, event("note-1")])).not.toThrow();

    expect(handlers.onEvent).not.toHaveBeenCalled();
  });

  it("ignores an EOSE message with a non-string subscription id", () => {
    const { socket, open, receive } = fakeSocket();
    const connection = new WebSocketRelayConnection("wss://a", socket);
    const handlers = { onEvent: vi.fn(), onEose: vi.fn(), onClosed: vi.fn() };
    connection.subscribe([{ kinds: [1] }], handlers);
    open();

    expect(() => receive(["EOSE", 5])).not.toThrow();

    expect(handlers.onEose).not.toHaveBeenCalled();
  });

  it("ignores a CLOSED message with a non-string subscription id and non-string reason", () => {
    const { socket, open, receive } = fakeSocket();
    const connection = new WebSocketRelayConnection("wss://a", socket);
    const handlers = { onEvent: vi.fn(), onEose: vi.fn(), onClosed: vi.fn() };
    connection.subscribe([{ kinds: [1] }], handlers);
    open();

    expect(() => receive(["CLOSED", 5, 3])).not.toThrow();

    expect(handlers.onClosed).not.toHaveBeenCalled();
  });

  it("falls back to a default reason when CLOSED's reason is not a string", () => {
    const { socket, sent, open, receive } = fakeSocket();
    const connection = new WebSocketRelayConnection("wss://a", socket);
    const handlers = { onEvent: vi.fn(), onEose: vi.fn(), onClosed: vi.fn() };
    connection.subscribe([{ kinds: [1] }], handlers);
    open();
    const subId = JSON.parse(sent[0])[1];

    // A malformed relay response: reason is a number, must not be forwarded as-is to a handler expecting a string.
    expect(() => receive(["CLOSED", subId, 3])).not.toThrow();

    expect(handlers.onClosed).toHaveBeenCalledWith("closed");
    expect(handlers.onClosed).not.toHaveBeenCalledWith(3);
  });

  it("ignores an OK message with a non-string event id", async () => {
    const { socket, open, receive } = fakeSocket();
    const connection = new WebSocketRelayConnection("wss://a", socket);
    open();

    const published = connection.publish(event("note-1"));

    expect(() => receive(["OK", 5, true, ""])).not.toThrow();

    // The bogus OK must not settle the pending publish; only the real, correctly-typed OK below may.
    receive(["OK", "note-1", true, ""]);
    await expect(published).resolves.toBeUndefined();
  });

  it("notifies onClose listeners once when the socket dies", () => {
    const { socket, open } = fakeSocket();
    const connection = new WebSocketRelayConnection("wss://one/", socket);
    const calls: string[] = [];
    connection.onClose(() => calls.push("a"));
    connection.onClose(() => calls.push("b"));

    open();
    socket.onclose?.();
    socket.onerror?.();

    expect(calls).toEqual(["a", "b"]);
  });

  it("stops notifying a listener that unsubscribed", () => {
    const { socket, open } = fakeSocket();
    const connection = new WebSocketRelayConnection("wss://one/", socket);
    const calls: string[] = [];
    const off = connection.onClose(() => calls.push("a"));

    open();
    off();
    socket.onclose?.();

    expect(calls).toEqual([]);
  });

  it("notifies a listener registered after the socket already died", () => {
    const { socket, open } = fakeSocket();
    const connection = new WebSocketRelayConnection("wss://one/", socket);
    open();
    socket.onclose?.();

    const calls: string[] = [];
    connection.onClose(() => calls.push("late"));

    // 既に死んでいる接続に登録したリスナはその場で呼ばれなければ、プールが永久に「生きている」と誤認する。
    expect(calls).toEqual(["late"]);
  });

  it("notifies onClose listeners when close() is called", () => {
    const { socket, open } = fakeSocket();
    const connection = new WebSocketRelayConnection("wss://one/", socket);
    const calls: string[] = [];
    connection.onClose(() => calls.push("closed"));

    open();
    connection.close();

    expect(socket.close).toHaveBeenCalled();

    // Simulate the async onclose event that the real WebSocket would fire
    socket.onclose?.();

    expect(calls).toEqual(["closed"]);
  });

  describe("onOpen", () => {
    // 変異: socket.onopen から通知を外すと落ちる。
    it("fires when the socket opens", () => {
      const { socket } = fakeSocket();
      const connection = new WebSocketRelayConnection("wss://a", socket);
      const calls: string[] = [];
      connection.onOpen(() => calls.push("open"));

      expect(calls).toEqual([]);
      socket.onopen?.();
      expect(calls).toEqual(["open"]);
    });

    // 変異: 「登録時に既に開いていたら即座に呼ぶ」分岐を消すと落ちる（プールは接続後に listener を登録するので速い open を取りこぼす）。
    it("fires immediately when registered after the socket is already open", () => {
      const { socket } = fakeSocket();
      const connection = new WebSocketRelayConnection("wss://a", socket);
      socket.onopen?.();

      const calls: string[] = [];
      connection.onOpen(() => calls.push("late"));
      expect(calls).toEqual(["late"]);
    });

    // 変異: 戻り値の解除関数を no-op にすると落ちる。
    it("returns an unsubscribe function", () => {
      const { socket } = fakeSocket();
      const connection = new WebSocketRelayConnection("wss://a", socket);
      const calls: string[] = [];
      const off = connection.onOpen(() => calls.push("a"));
      off();
      socket.onopen?.();
      expect(calls).toEqual([]);
    });

    // 変異: if (this.#isClosed()) return 分岐を消すと落ちる（死んだ接続への登録は race で遅れた onopen が発火しても呼ばれてはいけない）。
    it("does not fire for a listener registered after the socket died without opening", () => {
      const { socket } = fakeSocket();
      const connection = new WebSocketRelayConnection("wss://a", socket);
      socket.onclose?.();

      const calls: string[] = [];
      connection.onOpen(() => calls.push("never"));
      // 死んだ後に race: ソケットが遅れて onopen を発火
      socket.onopen?.();
      expect(calls).toEqual([]);
    });

    // 変異: socket.onopen 先頭の if (this.#opened) return; を消すと落ちる（実装は同じ onopen を 2 度呼ばない）。
    it("notifies onOpen listeners once when the socket opens", () => {
      const { socket } = fakeSocket();
      const connection = new WebSocketRelayConnection("wss://one/", socket);
      const calls: string[] = [];
      connection.onOpen(() => calls.push("a"));
      connection.onOpen(() => calls.push("b"));

      socket.onopen?.();
      socket.onopen?.();
      socket.onopen?.();

      expect(calls).toEqual(["a", "b"]);
    });
  });

  describe("NIP-42 auth", () => {
    const signer = (sign = vi.fn()) => ({
      getPublicKey: async () => "alice",
      signEvent: sign.mockImplementation(async (template) => ({
        ...template,
        id: `auth-${template.tags[1][1]}`,
        sig: "sig",
      })),
    });
    const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
    const lastSent = (sent: string[]) => JSON.parse(sent[sent.length - 1]);

    it("authenticates after auth-required and re-sends the REQ", async () => {
      const { socket, sent, open, receive } = fakeSocket();
      const sign = vi.fn();
      const connection = new WebSocketRelayConnection("wss://a/", socket, {
        signer: () => signer(sign),
        now: () => 500,
      });
      const handlers = { onEvent: vi.fn(), onEose: vi.fn(), onClosed: vi.fn() };
      connection.subscribe([{ kinds: [4] }], handlers);
      open();
      const subId = JSON.parse(sent[0])[1];

      receive(["AUTH", "ch1"]);
      expect(sign).not.toHaveBeenCalled();
      receive(["CLOSED", subId, "auth-required: dm"]);
      await flush();

      expect(lastSent(sent)).toEqual([
        "AUTH",
        {
          kind: 22_242,
          tags: [
            ["relay", "wss://a/"],
            ["challenge", "ch1"],
          ],
          content: "",
          pubkey: "alice",
          created_at: 500,
          id: "auth-ch1",
          sig: "sig",
        },
      ]);
      expect(connection.authAttempted).toBe(true);

      receive(["OK", "auth-ch1", true, ""]);
      await flush();

      expect(lastSent(sent)).toEqual(["REQ", subId, { kinds: [4] }]);
      expect(handlers.onClosed).not.toHaveBeenCalled();
      receive(["EOSE", subId]);
      expect(handlers.onEose).toHaveBeenCalledTimes(1);
    });

    it("signs once for subscriptions refused at the same time", async () => {
      const { socket, sent, open, receive } = fakeSocket();
      const sign = vi.fn();
      const connection = new WebSocketRelayConnection("wss://a/", socket, {
        signer: () => signer(sign),
      });
      const handlers = { onEvent: vi.fn(), onEose: vi.fn(), onClosed: vi.fn() };
      connection.subscribe([{ kinds: [4] }], handlers);
      connection.subscribe([{ kinds: [1059] }], handlers);
      open();
      receive(["AUTH", "ch1"]);
      receive(["CLOSED", JSON.parse(sent[0])[1], "auth-required: a"]);
      receive(["CLOSED", JSON.parse(sent[1])[1], "auth-required: b"]);
      await flush();
      receive(["OK", "auth-ch1", true, ""]);
      await flush();

      expect(sign).toHaveBeenCalledTimes(1);
      expect(sent.filter((m) => JSON.parse(m)[0] === "REQ")).toHaveLength(4);
    });

    it("gives up with the relay's reason when refused again after auth", async () => {
      const { socket, sent, open, receive } = fakeSocket();
      const connection = new WebSocketRelayConnection("wss://a/", socket, {
        signer: () => signer(),
      });
      const handlers = { onEvent: vi.fn(), onEose: vi.fn(), onClosed: vi.fn() };
      connection.subscribe([{ kinds: [4] }], handlers);
      open();
      const subId = JSON.parse(sent[0])[1];
      receive(["AUTH", "ch1"]);
      receive(["CLOSED", subId, "auth-required: dm"]);
      await flush();
      receive(["OK", "auth-ch1", true, ""]);
      await flush();
      receive(["CLOSED", subId, "auth-required: still no"]);

      expect(handlers.onClosed).toHaveBeenCalledWith("auth-required: still no");
    });

    it("reports the original refusal when there is no signer", async () => {
      const { socket, sent, open, receive } = fakeSocket();
      const connection = new WebSocketRelayConnection("wss://a/", socket, {
        signer: () => undefined,
      });
      const handlers = { onEvent: vi.fn(), onEose: vi.fn(), onClosed: vi.fn() };
      connection.subscribe([{ kinds: [4] }], handlers);
      open();
      receive(["AUTH", "ch1"]);
      receive(["CLOSED", JSON.parse(sent[0])[1], "auth-required: dm"]);
      await flush();

      expect(handlers.onClosed).toHaveBeenCalledWith("auth-required: dm");
      expect(connection.authAttempted).toBe(false);
    });

    it("reports the original refusal when the signer declines", async () => {
      const { socket, sent, open, receive } = fakeSocket();
      const connection = new WebSocketRelayConnection("wss://a/", socket, {
        signer: () => ({
          getPublicKey: async () => "alice",
          signEvent: async () => {
            throw new Error("user rejected");
          },
        }),
      });
      const handlers = { onEvent: vi.fn(), onEose: vi.fn(), onClosed: vi.fn() };
      connection.subscribe([{ kinds: [4] }], handlers);
      open();
      receive(["AUTH", "ch1"]);
      receive(["CLOSED", JSON.parse(sent[0])[1], "auth-required: dm"]);
      await flush();

      expect(handlers.onClosed).toHaveBeenCalledWith("auth-required: dm");
    });

    it("reports the original refusal when the relay rejects the auth", async () => {
      const { socket, sent, open, receive } = fakeSocket();
      const connection = new WebSocketRelayConnection("wss://a/", socket, {
        signer: () => signer(),
      });
      const handlers = { onEvent: vi.fn(), onEose: vi.fn(), onClosed: vi.fn() };
      connection.subscribe([{ kinds: [4] }], handlers);
      open();
      receive(["AUTH", "ch1"]);
      receive(["CLOSED", JSON.parse(sent[0])[1], "auth-required: dm"]);
      await flush();
      receive(["OK", "auth-ch1", false, "restricted: not a member"]);
      await flush();

      expect(handlers.onClosed).toHaveBeenCalledWith("auth-required: dm");
    });

    it("does not re-send a subscription closed while authenticating", async () => {
      const { socket, sent, open, receive } = fakeSocket();
      const connection = new WebSocketRelayConnection("wss://a/", socket, {
        signer: () => signer(),
      });
      const handlers = { onEvent: vi.fn(), onEose: vi.fn(), onClosed: vi.fn() };
      const subscription = connection.subscribe([{ kinds: [4] }], handlers);
      open();
      receive(["AUTH", "ch1"]);
      receive(["CLOSED", JSON.parse(sent[0])[1], "auth-required: dm"]);
      subscription.close();
      await flush();
      receive(["OK", "auth-ch1", true, ""]);
      await flush();

      expect(sent.filter((m) => JSON.parse(m)[0] === "REQ")).toHaveLength(1);
      expect(handlers.onClosed).not.toHaveBeenCalled();
    });

    it("authenticates after an auth-required OK and re-sends the EVENT", async () => {
      const { socket, sent, open, receive } = fakeSocket();
      const connection = new WebSocketRelayConnection("wss://a/", socket, {
        signer: () => signer(),
      });
      open();
      receive(["AUTH", "ch1"]);
      const published = connection.publish(event("note-1"));
      receive(["OK", "note-1", false, "auth-required: members only"]);
      await flush();
      receive(["OK", "auth-ch1", true, ""]);
      await flush();

      expect(lastSent(sent)).toEqual(["EVENT", event("note-1")]);
      receive(["OK", "note-1", true, ""]);
      await expect(published).resolves.toBeUndefined();
    });

    it("rejects a publish with the relay's reason when auth is impossible", async () => {
      const { socket, open, receive } = fakeSocket();
      const connection = new WebSocketRelayConnection("wss://a/", socket);
      open();
      receive(["AUTH", "ch1"]);
      const published = connection.publish(event("note-1"));
      receive(["OK", "note-1", false, "auth-required: members only"]);

      await expect(published).rejects.toThrow("auth-required: members only");
    });

    it("tries again with a new challenge after a failed attempt", async () => {
      const { socket, sent, open, receive } = fakeSocket();
      const sign = vi.fn();
      const connection = new WebSocketRelayConnection("wss://a/", socket, {
        signer: () => signer(sign),
      });
      const handlers = { onEvent: vi.fn(), onEose: vi.fn(), onClosed: vi.fn() };
      connection.subscribe([{ kinds: [4] }], handlers);
      connection.subscribe([{ kinds: [4] }], handlers);
      open();
      receive(["AUTH", "ch1"]);
      receive(["CLOSED", JSON.parse(sent[0])[1], "auth-required: dm"]);
      await flush();
      receive(["OK", "auth-ch1", false, "restricted: no"]);
      await flush();
      receive(["AUTH", "ch2"]);
      receive(["CLOSED", JSON.parse(sent[1])[1], "auth-required: dm"]);
      await flush();

      expect(sign).toHaveBeenCalledTimes(2);
      expect(lastSent(sent)[1].id).toBe("auth-ch2");
    });
  });
});
