import { describe, expect, it, vi } from "vite-plus/test";
import type { NostrEvent } from "../nostr/event";
import { createRelayTraffic, filterShape, utf8Length } from "./relay-traffic";
import {
  type WebSocketLike,
  WebSocketRelayConnection,
} from "./websocket-relay-connection";

const note = (id: string, kind = 1): NostrEvent => ({
  id,
  pubkey: "alice",
  created_at: 100,
  kind,
  tags: [],
  content: "あ",
  sig: "sig",
});

const fakeSocket = () => {
  const sent: string[] = [];
  const socket: WebSocketLike = {
    readyState: 0,
    send: (data: string) => sent.push(data),
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

const handlers = () => ({
  onEvent: vi.fn(),
  onEose: vi.fn(),
  onClosed: vi.fn(),
});

describe("utf8Length", () => {
  it("多バイトの文字とサロゲートペアを数える", () => {
    expect(utf8Length("a")).toBe(1);
    expect(utf8Length("é")).toBe(2);
    expect(utf8Length("あ")).toBe(3);
    expect(utf8Length("😀")).toBe(4);
  });
});

describe("filterShape", () => {
  it("値を捨て、kind と使ったキーと件数の多少だけを残す", () => {
    expect(
      filterShape([
        { "#p": ["a"], kinds: [3, 0] },
        { authors: ["a", "b"], kinds: [1], limit: 20, since: 1 },
      ]),
    ).toBe("kinds:0,3 #p(1) | kinds:1 authors(n) limit since");
  });
});

describe("createRelayTraffic", () => {
  it("リレーごとにメッセージ・kind・重複・購読を数える", () => {
    const traffic = createRelayTraffic(() => 0);
    const a = fakeSocket();
    const b = fakeSocket();
    const connA = new WebSocketRelayConnection("wss://a", a.socket, {
      traffic: traffic.recorder,
    });
    const connB = new WebSocketRelayConnection("wss://b", b.socket, {
      traffic: traffic.recorder,
    });

    const first = connA.subscribe([{ kinds: [1] }], handlers());
    connA.subscribe([{ kinds: [0] }], handlers());
    connB.subscribe([{ kinds: [1] }], handlers());
    a.open();
    b.open();
    const subA = JSON.parse(a.sent[0])[1];
    const subB = JSON.parse(b.sent[0])[1];

    a.receive(["EVENT", subA, note("x")]);
    a.receive(["EVENT", subA, note("y", 7)]);
    a.receive(["EOSE", subA]);
    b.receive(["EVENT", subB, note("x")]);
    a.receive(["NOTICE", "slow down"]);
    first.close();

    const [statsA, statsB] = traffic.snapshot();
    const eventBytes = utf8Length(JSON.stringify(["EVENT", subA, note("x")]));
    expect(statsA.sent.REQ.count).toBe(2);
    expect(statsA.sent.CLOSE.count).toBe(1);
    expect(statsA.received.EVENT).toEqual({ count: 2, bytes: eventBytes * 2 });
    expect(statsA.kinds[1]).toEqual({ count: 1, bytes: eventBytes });
    expect(statsA.kinds[7].count).toBe(1);
    expect(statsA.subscriptions).toBe(1);
    expect(statsA.peakSubscriptions).toBe(2);
    expect(statsA.notices).toEqual(["slow down"]);
    expect(statsA.duplicates.count).toBe(0);
    expect(statsB.duplicates).toEqual({ count: 1, bytes: eventBytes });
    expect(statsA.shapes["kinds:1"]).toEqual({
      reqs: 1,
      events: { count: 2, bytes: eventBytes * 2 },
      duplicates: { count: 0, bytes: 0 },
    });
    expect(statsA.shapes["kinds:0"].reqs).toBe(1);
    expect(statsB.shapes["kinds:1"].duplicates.count).toBe(1);
  });

  it("CLOSED の理由を数え、閉じた購読を外す", () => {
    const traffic = createRelayTraffic(() => 0);
    const { socket, sent, open, receive } = fakeSocket();
    const connection = new WebSocketRelayConnection("wss://a", socket, {
      traffic: traffic.recorder,
    });
    connection.subscribe([{ kinds: [1] }], handlers());
    open();
    receive([
      "CLOSED",
      JSON.parse(sent[0])[1],
      "error: too many subscriptions",
    ]);

    const [stats] = traffic.snapshot();
    expect(stats.closedReasons).toEqual({
      "error: too many subscriptions": 1,
    });
    expect(stats.subscriptions).toBe(0);
    expect(stats.peakSubscriptions).toBe(1);
  });

  it("待ち行列に積んだ REQ の数を足す", () => {
    const traffic = createRelayTraffic(() => 0);
    traffic.recorder.queued("wss://a");
    traffic.recorder.queued("wss://a");

    expect(traffic.snapshot()[0].queuedReqs).toBe(2);
  });

  it("繋ぎ直しをまたいで、いま開いている分も含めて接続時間を足す", () => {
    let now = 0;
    const traffic = createRelayTraffic(() => now);
    const first = fakeSocket();
    new WebSocketRelayConnection("wss://a", first.socket, {
      traffic: traffic.recorder,
    });
    first.open();
    now = 100;
    first.socket.onclose?.();

    const second = fakeSocket();
    new WebSocketRelayConnection("wss://a", second.socket, {
      traffic: traffic.recorder,
    });
    now = 150;
    second.open();
    now = 200;

    const [stats] = traffic.snapshot();
    expect(stats.attempts).toBe(2);
    expect(stats.connects).toBe(2);
    expect(stats.connectedMs).toBe(150);
    expect(stats.open).toBe(true);
  });

  it("数え直すときは、開いている接続と購読を残す", () => {
    let now = 0;
    const traffic = createRelayTraffic(() => now);
    const { socket, open, sent, receive } = fakeSocket();
    const connection = new WebSocketRelayConnection("wss://a", socket, {
      traffic: traffic.recorder,
    });
    connection.subscribe([{ kinds: [1] }], handlers());
    open();
    receive(["EVENT", JSON.parse(sent[0])[1], note("x")]);
    now = 100;
    traffic.reset();
    now = 130;
    receive(["EVENT", JSON.parse(sent[0])[1], note("x")]);

    const [stats] = traffic.snapshot();
    expect(stats.connectedMs).toBe(30);
    expect(stats.subscriptions).toBe(1);
    expect(stats.sent).toEqual({});
    // 数え直した後に最初に届いたものは重複に数えない。
    expect(stats.duplicates.count).toBe(0);
    expect(traffic.elapsedMs()).toBe(30);
  });
});
