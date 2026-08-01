import { describe, expect, it } from "vitest";
import { FakeRelayConnection } from "../relay/fake-relay-connection";
import type {
  RelaySubscriptionHandlers,
  RelayUrl,
} from "../relay/relay-connection";
import { ConnectionPool, type ConnectionPoolOptions } from "./connection-pool";

const noopHandlers = (): RelaySubscriptionHandlers => ({
  onEvent: () => {},
  onEose: () => {},
  onClosed: () => {},
});

/**
 * 手で進める偽スケジューラ。`vi.useFakeTimers()` ではなくこちらを注入する
 * ことで、プール (読み取り層) が実タイマーも DOM も掴んでいないことを型と
 * 構造の両方で示す。`advance(ms)` は「起床予定時刻 <= 進めた後の現在時刻」
 * のタイマーだけを、起床予定時刻の昇順で発火する。発火中に新しく積まれた
 * タイマー (再接続失敗時の再スケジュールなど) は、この呼び出しのスナップ
 * ショットに含まれないので同じ `advance()` 内では発火しない — 次の
 * `advance()` を待つ。
 */
// The handle type is deliberately `ReturnType<typeof setTimeout>` (matching
// `Scheduler`), not a bare `number` -- with @types/node in this project's
// ambient scope, that resolves to `NodeJS.Timeout`, not `number`. An earlier
// draft of this fake typed the handle as plain `number` and it type-checked
// under `pnpm exec vitest run` (which strips types) but silently failed a
// standalone `tsc` pass, exactly the class of hand-built-mock bug the task
// brief calls out. The fake still tracks handles as numbers internally; only
// the public shape is cast to match `Scheduler`.
type TimerHandle = ReturnType<typeof setTimeout>;

type FakeClock = {
  setTimeout: (callback: () => void, delayMs: number) => TimerHandle;
  clearTimeout: (handle: TimerHandle) => void;
  advance(ms: number): void;
};

const createFakeClock = (): FakeClock => {
  let now = 0;
  let nextId = 1;
  const timers = new Map<number, { at: number; callback: () => void }>();

  return {
    setTimeout: (callback, delayMs) => {
      const id = nextId++;
      timers.set(id, { at: now + delayMs, callback });
      return id as unknown as TimerHandle;
    },
    clearTimeout: (handle) => {
      timers.delete(handle as unknown as number);
    },
    advance(ms) {
      now += ms;
      const due = [...timers.entries()]
        .filter(([, timer]) => timer.at <= now)
        .sort((a, b) => a[1].at - b[1].at);
      for (const [id, timer] of due) {
        if (!timers.has(id)) continue; // already cleared by an earlier callback in this batch
        timers.delete(id);
        timer.callback();
      }
    },
  };
};

type CreatePoolOptions = {
  maxConnections?: number;
  /** connect() throws for any url in this list. */
  failing?: RelayUrl[];
  /** connection.subscribe() throws for any url in this list. */
  subscribeFailing?: RelayUrl[];
  /** Task 9: ジッタの決定性を保つための注入。既定は Math.random。 */
  random?: () => number;
};

const createPool = (options: CreatePoolOptions = {}) => {
  const connections = new Map<RelayUrl, FakeRelayConnection>();
  const connectCalls: RelayUrl[] = [];
  const failing = new Set(options.failing ?? []);
  const subscribeFailing = new Set(options.subscribeFailing ?? []);
  const clock = createFakeClock();

  const connect: ConnectionPoolOptions["connect"] = (url) => {
    connectCalls.push(url);
    if (failing.has(url)) throw new Error(`connect failed for ${url}`);
    const relay = new FakeRelayConnection(url);
    if (subscribeFailing.has(url)) {
      const brokenSubscribe = () => {
        throw new Error(`subscribe failed for ${url}`);
      };
      // Override just the method under test; everything else stays the
      // real FakeRelayConnection behavior.
      Object.defineProperty(relay, "subscribe", { value: brokenSubscribe });
    }
    connections.set(url, relay);
    return relay;
  };

  const pool = new ConnectionPool({
    connect,
    maxConnections: options.maxConnections,
    scheduler: clock,
    random: options.random,
  });

  return { pool, connections, connectCalls, clock };
};

describe("ConnectionPool", () => {
  it("shares one connection between subscriptions to the same relay", () => {
    const { pool, connectCalls } = createPool();
    pool.subscribe("wss://one/", [{ kinds: [1] }], noopHandlers());
    pool.subscribe("wss://one/", [{ kinds: [7] }], noopHandlers());

    expect(connectCalls).toEqual(["wss://one/"]);
    expect(pool.size).toBe(1);
  });

  it("closes the connection when the last subscription closes", () => {
    const { pool, connections } = createPool();
    const a = pool.subscribe("wss://one/", [{ kinds: [1] }], noopHandlers());
    const b = pool.subscribe("wss://one/", [{ kinds: [7] }], noopHandlers());

    a?.close();
    expect(connections.get("wss://one/")?.closed).toBe(false);
    b?.close();
    expect(connections.get("wss://one/")?.closed).toBe(true);
    expect(pool.size).toBe(0);
  });

  it("refuses a new relay once the budget is full", () => {
    const { pool } = createPool({ maxConnections: 1 });
    expect(
      pool.subscribe("wss://one/", [{ kinds: [1] }], noopHandlers()),
    ).toBeDefined();
    expect(
      pool.subscribe("wss://two/", [{ kinds: [1] }], noopHandlers()),
    ).toBeUndefined();
  });

  it("still accepts another subscription to an already open relay at the budget", () => {
    const { pool } = createPool({ maxConnections: 1 });
    pool.subscribe("wss://one/", [{ kinds: [1] }], noopHandlers());

    // No new socket is needed, so the budget doesn't apply.
    expect(
      pool.subscribe("wss://one/", [{ kinds: [7] }], noopHandlers()),
    ).toBeDefined();
  });

  it("does not let a subscription from before dispose() close a later connection", () => {
    const { pool, connections } = createPool();
    const stale = pool.subscribe(
      "wss://one/",
      [{ kinds: [1] }],
      noopHandlers(),
    );
    pool.dispose();
    pool.subscribe("wss://one/", [{ kinds: [1] }], noopHandlers());
    const fresh = connections.get("wss://one/");

    stale?.close();

    expect(fresh?.closed).toBe(false);
    expect(pool.size).toBe(1);
  });

  it("reports the relay as closed instead of throwing when connect() fails", () => {
    // A single dead relay out of 30 must not turn every column into an
    // exception.
    const { pool } = createPool({ failing: ["wss://bad/"] });
    const reasons: string[] = [];

    const sub = pool.subscribe("wss://bad/", [{ kinds: [1] }], {
      onEvent: () => {},
      onEose: () => {},
      onClosed: (reason) => reasons.push(reason),
    });

    expect(reasons).toHaveLength(1);
    expect(() => sub?.close()).not.toThrow();
  });

  // Not in the brief's verbatim list, but the same total-close guarantee
  // must also hold when connect() succeeds but connection.subscribe()
  // itself throws (step 4 of the brief's algorithm) — a different failure
  // point than connect() rejecting outright.
  it("reports the relay as closed instead of throwing when connection.subscribe() fails", () => {
    const { pool } = createPool({ subscribeFailing: ["wss://flaky/"] });
    const reasons: string[] = [];

    const sub = pool.subscribe("wss://flaky/", [{ kinds: [1] }], {
      onEvent: () => {},
      onEose: () => {},
      onClosed: (reason) => reasons.push(reason),
    });

    expect(reasons).toHaveLength(1);
    expect(() => sub?.close()).not.toThrow();
  });

  // Ruling A: PooledSubscription.close() must be total — never throw, no
  // matter how many times it's called or in what order relative to dispose().
  it("close() never throws, including double-close and close-after-dispose", () => {
    const { pool } = createPool();
    const sub = pool.subscribe("wss://one/", [{ kinds: [1] }], noopHandlers());

    expect(() => sub?.close()).not.toThrow();
    expect(() => sub?.close()).not.toThrow(); // double close
    expect(() => pool.dispose()).not.toThrow();
    expect(() => sub?.close()).not.toThrow(); // close after dispose
  });

  it("dispose() closes every pooled connection and empties the pool", () => {
    const { pool, connections } = createPool();
    pool.subscribe("wss://one/", [{ kinds: [1] }], noopHandlers());
    pool.subscribe("wss://two/", [{ kinds: [1] }], noopHandlers());

    pool.dispose();

    expect(connections.get("wss://one/")?.closed).toBe(true);
    expect(connections.get("wss://two/")?.closed).toBe(true);
    expect(pool.size).toBe(0);
  });

  // A relay whose connect() failed keeps its entry (for a later reconnect,
  // Task 9) but must not occupy budget — ambiguity 1 in the brief.
  it("does not count a failed connection against the budget", () => {
    const { pool } = createPool({
      maxConnections: 1,
      failing: ["wss://bad/"],
    });
    pool.subscribe("wss://bad/", [{ kinds: [1] }], noopHandlers());
    expect(pool.size).toBe(0);

    // The budget is still fully available for a different relay.
    expect(
      pool.subscribe("wss://good/", [{ kinds: [1] }], noopHandlers()),
    ).toBeDefined();
    expect(pool.size).toBe(1);
  });

  // Task 8: a socket that dies on its own (as opposed to being close()d by
  // the pool) must not keep occupying a budget slot (ADR-0021).
  it("frees the slot when a connection dies on its own", () => {
    const { pool, connections } = createPool({ maxConnections: 1 });
    pool.subscribe("wss://one/", [{ kinds: [1] }], noopHandlers());
    expect(pool.size).toBe(1);

    connections.get("wss://one/")?.die();

    // A dead socket must not keep holding one of the 30 slots (ADR-0021).
    expect(pool.size).toBe(0);
    expect(
      pool.subscribe("wss://two/", [{ kinds: [1] }], noopHandlers()),
    ).toBeDefined();
  });

  it("does not hand a dead connection to the next subscriber", () => {
    const { pool, connections, connectCalls } = createPool();
    pool.subscribe("wss://one/", [{ kinds: [1] }], noopHandlers());
    connections.get("wss://one/")?.die();

    const reasons: string[] = [];
    pool.subscribe("wss://one/", [{ kinds: [7] }], {
      onEvent: () => {},
      onEose: () => {},
      onClosed: (reason) => reasons.push(reason),
    });

    // Handing over a corpse fires onClosed immediately and that column
    // stays unreachable forever.
    expect(reasons).toEqual([]);
    expect(connectCalls).toEqual(["wss://one/", "wss://one/"]);
  });

  // Decision 1 (the brief's most emphasized rule): the connection itself
  // (FakeRelayConnection.die() / WebSocketRelayConnection.fail()) already
  // distributes onClosed to every handler it holds. The pool must not call
  // it a second time — that would double-count incomplete.unreachableRelays,
  // a defect invisible downstream because SectionReader.status is a boolean
  // per relay. Only a raw callback-count assertion can catch it.
  it("does not call onClosed a second time when the connection dies", () => {
    const { pool, connections } = createPool();
    let closedCount = 0;
    pool.subscribe("wss://one/", [{ kinds: [1] }], {
      onEvent: () => {},
      onEose: () => {},
      onClosed: () => {
        closedCount += 1;
      },
    });

    connections.get("wss://one/")?.die();

    expect(closedCount).toBe(1);
  });

  it("calls onClosed exactly once per entry when a shared connection dies", () => {
    const { pool, connections } = createPool();
    let aClosed = 0;
    let bClosed = 0;
    pool.subscribe("wss://one/", [{ kinds: [1] }], {
      onEvent: () => {},
      onEose: () => {},
      onClosed: () => {
        aClosed += 1;
      },
    });
    pool.subscribe("wss://one/", [{ kinds: [7] }], {
      onEvent: () => {},
      onEose: () => {},
      onClosed: () => {
        bClosed += 1;
      },
    });

    connections.get("wss://one/")?.die();

    expect(aClosed).toBe(1);
    expect(bClosed).toBe(1);
  });

  // Decision 2: the pooled record (and its entry set) must survive a
  // death, distinguishable from the whole record being discarded. That
  // distinction isn't visible through `size` alone (both read 0 once the
  // connection is null) — it only becomes observable once something reuses
  // the retained record: a fresh subscribe() to the same URL. If the
  // record had been discarded, the fresh subscribe() would start an empty
  // entry set containing only the new entry, and closing that entry alone
  // would immediately empty it and tear the new connection down. If the
  // record was correctly retained, the pre-death entry is still counted,
  // so the new connection must survive the new entry's close alone.
  it("does not drop the pooled record until every entry, including ones added after death, has closed", () => {
    const { pool, connections, connectCalls } = createPool();
    const stale = pool.subscribe(
      "wss://one/",
      [{ kinds: [1] }],
      noopHandlers(),
    );
    connections.get("wss://one/")?.die();

    const fresh = pool.subscribe(
      "wss://one/",
      [{ kinds: [7] }],
      noopHandlers(),
    );
    const reconnected = connections.get("wss://one/");
    expect(connectCalls).toEqual(["wss://one/", "wss://one/"]);

    // Closing only the freshly (re)subscribed entry must not tear the
    // connection down — the stale, pre-death entry is still registered.
    expect(() => fresh?.close()).not.toThrow();
    expect(reconnected?.closed).toBe(false);

    // Closing the last remaining (stale) entry finally empties the
    // registry and drops the connection.
    expect(() => stale?.close()).not.toThrow();
    expect(reconnected?.closed).toBe(true);
  });

  // ---------------------------------------------------------------------
  // Task 9: reconnection. ADR-0021 (now accepted) says the pool never gives
  // up, backs off exponentially with jitter capped at 60s, and re-issues the
  // entries retained across a death (Decision 2 above) unchanged — no
  // `since` backfill.
  // ---------------------------------------------------------------------

  it("reconnects with exponential backoff after a death", () => {
    const { pool, connections, connectCalls, clock } = createPool({
      random: () => 0.5,
    });
    pool.subscribe("wss://one/", [{ kinds: [1] }], noopHandlers());
    connections.get("wss://one/")?.die();

    clock.advance(999);
    expect(connectCalls).toHaveLength(1);
    clock.advance(1); // first backoff: 1s * (0.5 + 0.5)
    expect(connectCalls).toHaveLength(2);
  });

  it("re-issues the original filters on reconnect", () => {
    const { pool, connections, clock } = createPool({ random: () => 0.5 });
    pool.subscribe(
      "wss://one/",
      [{ kinds: [1], authors: ["abc"] }],
      noopHandlers(),
    );
    connections.get("wss://one/")?.die();

    clock.advance(1000);

    // Do not backfill with `since` -- re-issue the original filter as-is.
    expect(connections.get("wss://one/")?.subscriptions[0].filters).toEqual([
      { kinds: [1], authors: ["abc"] },
    ]);
  });

  it("caps the backoff at 60 seconds and never gives up", () => {
    const { pool, connections, connectCalls, clock } = createPool({
      random: () => 0.5,
    });
    pool.subscribe("wss://one/", [{ kinds: [1] }], noopHandlers());

    for (let attempt = 0; attempt < 12; attempt += 1) {
      connections.get("wss://one/")?.die();
      clock.advance(60_000);
    }

    // Must not give up after 8 attempts -- a laptop waking from sleep must
    // not be left with only a manual retry as its recovery path.
    expect(connectCalls.length).toBe(13);
  });

  it("applies jitter so reconnections do not synchronise", () => {
    const { pool, connections, connectCalls, clock } = createPool({
      random: () => 0,
    });
    pool.subscribe("wss://one/", [{ kinds: [1] }], noopHandlers());
    connections.get("wss://one/")?.die();

    clock.advance(499);
    expect(connectCalls).toHaveLength(1);
    clock.advance(1); // 1000 * (0.5 + 0) = 500ms
    expect(connectCalls).toHaveLength(2);
  });

  it("retryNow() reconnects immediately and resets the backoff", () => {
    const { pool, connections, connectCalls, clock } = createPool({
      random: () => 0.5,
    });
    pool.subscribe("wss://one/", [{ kinds: [1] }], noopHandlers());
    connections.get("wss://one/")?.die();
    clock.advance(1000);
    connections.get("wss://one/")?.die(); // second death

    pool.retryNow();

    expect(connectCalls).toHaveLength(3);
    // Backoff is reset, so the next death after retryNow() waits 1s again.
    connections.get("wss://one/")?.die();
    clock.advance(1000);
    expect(connectCalls).toHaveLength(4);
  });

  it("stops reconnecting once the last subscription closed", () => {
    const { pool, connections, connectCalls, clock } = createPool({
      random: () => 0.5,
    });
    const sub = pool.subscribe("wss://one/", [{ kinds: [1] }], noopHandlers());
    connections.get("wss://one/")?.die();

    sub?.close();
    clock.advance(60_000);

    expect(connectCalls).toHaveLength(1);
  });

  it("does not schedule a reconnect timer if the budget is full when the timer fires, and retries again later", () => {
    // Two relays share a budget of 1. wss://one/ dies; wss://two/ is holding
    // the sole slot when the reconnect timer fires, so the reconnect must
    // reschedule instead of stealing the slot from a live relay.
    const { pool, connections, connectCalls, clock } = createPool({
      maxConnections: 1,
      random: () => 0.5,
    });
    pool.subscribe("wss://one/", [{ kinds: [1] }], noopHandlers());
    connections.get("wss://one/")?.die();

    // The budget is now free (size is 0), so a second relay can take it.
    pool.subscribe("wss://two/", [{ kinds: [1] }], noopHandlers());
    expect(pool.size).toBe(1);

    clock.advance(1000);
    // wss://one/'s reconnect attempt found the budget full (wss://two/ holds
    // the only slot) and must not have opened a second socket.
    expect(connectCalls).toEqual(["wss://one/", "wss://two/"]);
    expect(pool.size).toBe(1);
  });
});
