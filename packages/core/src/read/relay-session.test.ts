import { describe, expect, it, vi } from "vite-plus/test";
import { FakeRelayConnection } from "../relay/fake-relay-connection";
import type {
  RelaySubscriptionHandlers,
  RelayUrl,
} from "../relay/relay-connection";
import { createFakeClock } from "./fake-clock";
import {
  DEFAULT_MAX_SUBSCRIPTIONS,
  IDLE_LINGER_MS,
  MAX_NOTICE_REFUSALS,
  RelaySession,
} from "./relay-session";

const URL = "wss://one/";

const noopHandlers = (): RelaySubscriptionHandlers => ({
  onEvent: () => {},
  onEose: () => {},
  onClosed: () => {},
});

type CreateSessionOptions = {
  /**
   * NIP-11 の `max_subscriptions` にあたる枠。`null` は上限が書いていないと分かった
   * リレー、キーが無ければまだ分からない。渡さなければ窓口は枠を持たない。
   */
  maxSubscriptions?: Record<RelayUrl, number | null>;
  random?: () => number;
  /** 最初の何回の `connect()` を失敗させるか。 */
  failFirstConnects?: number;
};

/** プールを介さず、予算・失敗の記録・学んだ枠を最小の偽物で与えた窓口。 */
const createSession = (options: CreateSessionOptions = {}) => {
  const connections = new Map<RelayUrl, FakeRelayConnection>();
  const clock = createFakeClock();
  const queued: RelayUrl[] = [];
  const events = { failures: 0, cleared: 0, closed: 0, connects: 0 };
  let learned: number | undefined;

  const session = new RelaySession({
    url: URL,
    scheduler: clock,
    random: options.random ?? (() => 0.5),
    connect: () => {
      events.connects += 1;
      if (events.connects <= (options.failFirstConnects ?? 0)) {
        throw new Error("connect failed");
      }
      const relay = new FakeRelayConnection(URL);
      connections.set(URL, relay);
      return relay;
    },
    makeRoom: () => true,
    failureCount: () => events.failures,
    noteFailure: () => {
      events.failures += 1;
    },
    clearFailures: () => {
      events.cleared += 1;
      events.failures = 0;
    },
    onConnected: () => {},
    ...(options.maxSubscriptions && {
      declaredLimit: () => options.maxSubscriptions?.[URL],
    }),
    learnedLimit: () => learned,
    learn: (limit) => {
      learned = Math.min(learned ?? Number.POSITIVE_INFINITY, limit);
    },
    onQueued: () => queued.push(URL),
    onClosed: () => {
      events.closed += 1;
    },
  });
  session.ensureConnected(false);

  return { session, connections, clock, queued, events };
};

describe("RelaySession の同時購読の枠", () => {
  const sent = (connections: Map<RelayUrl, FakeRelayConnection>) =>
    connections.get(URL)?.subscriptions.filter((sub) => !sub.closed) ?? [];

  it("枠が埋まっていると REQ を送らず、1 本閉じると送る", () => {
    const { session, connections, queued } = createSession({
      maxSubscriptions: { [URL]: 2 },
    });
    const a = session.subscribe([{ kinds: [1] }], noopHandlers());
    session.subscribe([{ kinds: [2] }], noopHandlers());
    session.subscribe([{ kinds: [3] }], noopHandlers());

    expect(connections.get(URL)?.subscriptions).toHaveLength(2);
    expect(queued).toEqual([URL]);

    a?.close();

    expect(connections.get(URL)?.subscriptions).toHaveLength(3);
    expect(connections.get(URL)?.subscriptions[2].filters).toEqual([
      { kinds: [3] },
    ]);
  });

  it("流し続ける購読が、先に待っていた一度きりの取得より先に通る", () => {
    const { session, connections } = createSession({
      maxSubscriptions: { [URL]: 1 },
    });
    const first = session.subscribe([{ kinds: [1] }], noopHandlers());
    session.subscribe([{ kinds: [7] }], noopHandlers(), { once: true });
    session.subscribe([{ kinds: [2] }], noopHandlers());

    first?.close();

    const subscriptions = connections.get(URL)?.subscriptions ?? [];
    expect(subscriptions).toHaveLength(2);
    expect(subscriptions[1].filters).toEqual([{ kinds: [2] }]);
  });

  it("一度きりの取得は EOSE で REQ を閉じ、枠を待っている購読へ渡す", () => {
    const { session, connections } = createSession({
      maxSubscriptions: { [URL]: 1 },
    });
    const onEose = vi.fn();
    session.subscribe(
      [{ kinds: [7] }],
      { ...noopHandlers(), onEose },
      {
        once: true,
      },
    );
    session.subscribe([{ kinds: [1] }], noopHandlers());

    connections.get(URL)?.emitEose(0);

    expect(onEose).toHaveBeenCalledOnce();
    expect(connections.get(URL)?.subscriptions[0].closed).toBe(true);
    expect(connections.get(URL)?.subscriptions).toHaveLength(2);
  });

  it("待っている購読を close すると、送らずに待ち行列から消える", () => {
    const { session, connections } = createSession({
      maxSubscriptions: { [URL]: 1 },
    });
    const first = session.subscribe([{ kinds: [1] }], noopHandlers());
    const waiting = session.subscribe([{ kinds: [2] }], noopHandlers());

    waiting?.close();
    first?.close();

    expect(connections.get(URL)?.subscriptions).toHaveLength(1);
  });

  it("待っている間に接続が死んでも、繋ぎ直したあとで枠の範囲で送る", () => {
    const { session, connections, clock } = createSession({
      maxSubscriptions: { [URL]: 1 },
      random: () => 0.5,
    });
    session.subscribe([{ kinds: [1] }], noopHandlers());
    session.subscribe([{ kinds: [2] }], noopHandlers());

    connections.get(URL)?.die();
    clock.advance(2_000);

    expect(sent(connections)).toHaveLength(1);
    expect(sent(connections)[0].filters).toEqual([{ kinds: [1] }]);
  });

  /** `count` 本の流し続ける購読を出す。kind は 1 から。 */
  const openMany = (
    session: RelaySession,
    count: number,
    handlers = noopHandlers,
  ) =>
    Array.from({ length: count }, (_, index) =>
      session.subscribe([{ kinds: [index + 1] }], handlers()),
    );

  it("NIP-11 に上限が無いリレーでは、NOTICE の対象は直前に EOSE を受けた購読で、枠は数えた値から学ぶ", () => {
    const { session, connections, queued } = createSession({
      maxSubscriptions: { [URL]: null },
    });
    const subs = openMany(session, 30);
    const connection = connections.get(URL);

    // 実際の順: 断られた REQ にも EVENT と EOSE が返り、そのあとに NOTICE が来る。
    connection?.emitEose(29);
    connection?.emitNotice("ERROR: too many concurrent REQs");

    // EOSE がまだの 29 本目 (index 28) は閉じず、30 本目だけが待ち行列に戻る。
    expect(sent(connections)).toHaveLength(29);
    expect(
      sent(connections).some((sub) => sub.filters[0].kinds?.[0] === 29),
    ).toBe(true);
    expect(queued).toEqual([URL]);

    // 枠は「sent の数 − 1」の 29 本。1 本閉じると戻された REQ が送られる。
    subs[0]?.close();
    expect(sent(connections)).toHaveLength(29);
    expect(connections.get(URL)?.subscriptions.at(-1)?.filters).toEqual([
      { kinds: [30] },
    ]);
  });

  it("学ぶ枠は既定値より小さくしない", () => {
    const { session, connections } = createSession({
      maxSubscriptions: { [URL]: null },
    });
    openMany(session, 5);

    connections.get(URL)?.emitEose(4);
    connections.get(URL)?.emitNotice("ERROR: too many concurrent REQs");
    openMany(session, 25);

    // 5 本のうち 1 本が戻り、枠は max(4, 20) = 20。
    expect(sent(connections)).toHaveLength(20);
  });

  it("対象が一度きりの取得なら、もう取れているので何もしない", () => {
    const { session, connections, queued } = createSession({
      maxSubscriptions: { [URL]: null },
    });
    session.subscribe([{ kinds: [1] }], noopHandlers(), { once: true });
    openMany(session, 29);
    const connection = connections.get(URL);

    connection?.emitEose(0);
    connection?.emitNotice("ERROR: too many concurrent REQs");

    expect(connection?.subscriptions).toHaveLength(30);
    expect(sent(connections)).toHaveLength(29);
    // 枠も学ばない。
    openMany(session, 50);
    expect(sent(connections)).toHaveLength(79);
    expect(queued).toEqual([]);
  });

  it("NIP-11 に上限があるリレーでは、戻すだけで枠は学ばず、他の購読が閉じるまで送り直さない", () => {
    const { session, connections } = createSession({
      maxSubscriptions: { [URL]: 3 },
    });
    const subs = openMany(session, 4);
    const connection = connections.get(URL);

    connection?.emitEose(1);
    connection?.emitNotice("ERROR: too many concurrent REQs");

    // 戻された kind 2 は送り直されない。枠が空いた分は、待っていた kind 4 が使う。
    expect(sent(connections).map((sub) => sub.filters[0].kinds?.[0])).toEqual([
      1, 3, 4,
    ]);
    const before = connection?.subscriptions.length;
    connection?.emitEose(2);
    expect(connection?.subscriptions).toHaveLength(before ?? -1);

    // 枠が実際に空くと、枠は 3 のまま送り直される。
    subs[0]?.close();
    expect(connection?.subscriptions.at(-1)?.filters).toEqual([{ kinds: [2] }]);
    expect(sent(connections)).toHaveLength(3);
  });

  it("同じ購読が NOTICE で戻された回数が上限を超えたら、送り直さず欠けとして伝える", () => {
    const { session, connections } = createSession({
      maxSubscriptions: { [URL]: 4 },
    });
    const onClosed = vi.fn();
    const target = session.subscribe([{ kinds: [1] }], {
      ...noopHandlers(),
      onClosed,
    });
    const others = [2, 3, 4, 5].map((kind) =>
      session.subscribe([{ kinds: [kind] }], noopHandlers()),
    );
    const connection = connections.get(URL);
    const refuse = () => {
      const subscriptions = connection?.subscriptions ?? [];
      let index = -1;
      subscriptions.forEach((sub, i) => {
        if (sub.filters[0].kinds?.[0] === 1) index = i;
      });
      connection?.emitEose(index);
      connection?.emitNotice("ERROR: too many concurrent REQs");
    };
    const sentTargets = () =>
      connection?.subscriptions.filter((sub) => sub.filters[0].kinds?.[0] === 1)
        .length;

    for (let round = 0; round < MAX_NOTICE_REFUSALS; round++) {
      refuse();
      expect(onClosed).not.toHaveBeenCalled();
      others[round]?.close();
      expect(sentTargets()).toBe(round + 2);
    }

    refuse();
    others[MAX_NOTICE_REFUSALS]?.close();

    expect(onClosed).toHaveBeenCalledOnce();
    expect(sentTargets()).toBe(MAX_NOTICE_REFUSALS + 1);
    expect(
      sent(connections).map((sub) => sub.filters[0].kinds?.[0]),
    ).not.toContain(1);
    target?.close();
  });

  it("EOSE を受けていないのに NOTICE が来ても、何も戻さない", () => {
    const { session, connections } = createSession({
      maxSubscriptions: { [URL]: null },
    });
    openMany(session, 3);

    connections.get(URL)?.emitNotice("ERROR: too many concurrent REQs");

    expect(sent(connections)).toHaveLength(3);
  });

  it("断られた REQ は、戻されても呼び出し元に CLOSED を伝えない", () => {
    const { session, connections } = createSession({
      maxSubscriptions: { [URL]: null },
    });
    const onClosed = vi.fn();
    openMany(session, 25, () => ({ ...noopHandlers(), onClosed }));

    connections.get(URL)?.emitEose(24);
    connections.get(URL)?.emitNotice("error: Too Many Concurrent REQs");

    expect(onClosed).not.toHaveBeenCalled();
    expect(sent(connections)).toHaveLength(24);
  });

  it("CLOSED の理由が上限でも、同じように枠を下げて待たせる", () => {
    const { session, connections } = createSession();
    const onClosed = vi.fn();
    for (const kind of [1, 2, 3]) {
      session.subscribe([{ kinds: [kind] }], { ...noopHandlers(), onClosed });
    }

    connections
      .get(URL)
      ?.emitClosed(2, "rate-limited: too many concurrent REQs");

    expect(onClosed).not.toHaveBeenCalled();
    expect(sent(connections)).toHaveLength(2);
    session.subscribe([{ kinds: [4] }], noopHandlers());
    expect(sent(connections)).toHaveLength(2);
  });

  it("開いているのが 1 本だけなら、上限の NOTICE でも戻さない", () => {
    const { session, connections } = createSession();
    session.subscribe([{ kinds: [1] }], noopHandlers());

    connections.get(URL)?.emitEose(0);
    connections.get(URL)?.emitNotice("ERROR: too many concurrent REQs");

    expect(sent(connections)).toHaveLength(1);
    expect(connections.get(URL)?.subscriptions).toHaveLength(1);
  });

  it("上限と関係のない NOTICE では何も変えない", () => {
    const { session, connections } = createSession();
    openMany(session, 2);

    connections.get(URL)?.emitEose(1);
    connections.get(URL)?.emitNotice("rate limited");
    session.subscribe([{ kinds: [3] }], noopHandlers());

    expect(sent(connections)).toHaveLength(3);
  });

  it("NIP-11 が取れるまで、取れなかったリレーは既定の枠 (20) で抑える", () => {
    const { session, connections, queued } = createSession({
      maxSubscriptions: {},
    });
    openMany(session, 25);

    expect(sent(connections)).toHaveLength(DEFAULT_MAX_SUBSCRIPTIONS);
    expect(DEFAULT_MAX_SUBSCRIPTIONS).toBe(20);
    expect(queued).toHaveLength(5);
  });

  it("NIP-11 に上限が書いていないと分かったリレーは枠なしで、すべて送る", () => {
    const { session, connections, queued } = createSession({
      maxSubscriptions: { [URL]: null },
    });
    openMany(session, 50);

    expect(connections.get(URL)?.subscriptions).toHaveLength(50);
    expect(queued).toEqual([]);
  });

  it("上限の分かる枠を渡さない窓口は枠を持たない", () => {
    const { session, connections } = createSession();
    openMany(session, 50);

    expect(connections.get(URL)?.subscriptions).toHaveLength(50);
  });

  it("断られて学んだ枠は、繋ぎ直しても覚えている", () => {
    const { session, connections, clock } = createSession({
      maxSubscriptions: { [URL]: null },
      random: () => 0.5,
    });
    openMany(session, 30);
    connections.get(URL)?.emitEose(29);
    connections.get(URL)?.emitNotice("ERROR: too many concurrent REQs");

    connections.get(URL)?.die();
    clock.advance(2_000);

    expect(sent(connections)).toHaveLength(29);
  });
});

describe("RelaySession の猶予", () => {
  it("最後の購読が閉じても猶予のあいだは接続を残し、切れたら窓口を閉じる", () => {
    const { session, connections, clock, events } = createSession();
    const subscription = session.subscribe([{ kinds: [1] }], noopHandlers());

    subscription.close();
    clock.advance(IDLE_LINGER_MS - 1);
    expect(connections.get(URL)?.closed).toBe(false);
    expect(session.inUse).toBe(false);

    clock.advance(1);
    expect(connections.get(URL)?.closed).toBe(true);
    expect(events.closed).toBe(1);
  });

  it("猶予のあいだに使われたら、猶予を取り消す", () => {
    const { session, clock, events } = createSession();
    session.subscribe([{ kinds: [1] }], noopHandlers()).close();

    session.ensureConnected(false);
    session.subscribe([{ kinds: [2] }], noopHandlers());
    clock.advance(IDLE_LINGER_MS * 2);

    expect(session.inUse).toBe(true);
    expect(events.closed).toBe(0);
  });

  it("hold が残っていれば、購読が閉じても猶予に入らない", () => {
    const { session, clock, events } = createSession();
    const hold = session.hold();
    session.subscribe([{ kinds: [1] }], noopHandlers()).close();
    clock.advance(IDLE_LINGER_MS * 2);
    expect(events.closed).toBe(0);

    hold.release();
    clock.advance(IDLE_LINGER_MS);
    expect(events.closed).toBe(1);
  });
});

describe("RelaySession の再接続", () => {
  it("最初の接続に失敗しても、バックオフを置いて繋ぎ直し、購読を張る", () => {
    const { session, connections, clock, events } = createSession({
      failFirstConnects: 1,
    });
    const onClosed = vi.fn();
    session.subscribe([{ kinds: [1] }], { ...noopHandlers(), onClosed });

    expect(onClosed).toHaveBeenCalledWith("relay unavailable");
    expect(events.failures).toBe(1);
    expect(session.hasConnection).toBe(false);

    clock.advance(1_000);

    expect(session.hasConnection).toBe(true);
    expect(connections.get(URL)?.subscriptions).toHaveLength(1);
  });

  it("接続が死んだら、失敗の回数に応じたバックオフのあとで元のフィルタを張り直す", () => {
    const { session, connections, clock, events } = createSession({
      random: () => 0.5,
    });
    session.subscribe([{ kinds: [1] }], noopHandlers());

    connections.get(URL)?.die();
    expect(events.failures).toBe(1);
    clock.advance(999);
    expect(session.hasConnection).toBe(false);
    clock.advance(1);

    expect(session.hasConnection).toBe(true);
    expect(connections.get(URL)?.subscriptions[0].filters).toEqual([
      { kinds: [1] },
    ]);
  });

  it("閉じた窓口は再接続しない", () => {
    const { session, connections, clock, events } = createSession();
    session.subscribe([{ kinds: [1] }], noopHandlers());
    connections.get(URL)?.die();

    session.close();
    clock.advance(120_000);

    expect(session.hasConnection).toBe(false);
    expect(events.connects).toBe(1);
  });
});
