import { describe, expect, it } from "vitest";
import type { NostrEvent } from "../nostr/event";
import { FakeRelayConnection } from "../relay/fake-relay-connection";
import type {
  RelaySubscriptionHandlers,
  RelayUrl,
} from "../relay/relay-connection";
import { ConnectionPool, type ConnectionPoolOptions } from "./connection-pool";

/**
 * publish() のテストだけが使う、内容を気にしない最小のイベント。
 * `ConnectionPool.publish()` は署名検証をしない (それは `EventStore.put` の
 * 責務) ので、id/sig は本物である必要が無い。
 */
const fakeEvent = (id: string): NostrEvent => ({
  id,
  pubkey: "p".repeat(64),
  created_at: 1_700_000_000,
  kind: 1,
  tags: [],
  content: "hello",
  sig: "s".repeat(128),
});

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
  /**
   * Fix round 1 (Important 4): how many times `clearTimeout` was actually
   * called. `connectCalls` staying flat after a `close()` is not proof the
   * pending timer was cancelled -- `#reconnect`'s `!pooled` guard makes that
   * hold even if `#drop`'s `clearTimeout` call were deleted outright (the
   * dropped record is gone, so a leaked timer's `#reconnect` call finds
   * nothing and no-ops). Only a direct count on the scheduler itself proves
   * cancellation happened.
   */
  clearTimeoutCallCount: number;
};

const createFakeClock = (): FakeClock => {
  let now = 0;
  let nextId = 1;
  let clearTimeoutCallCount = 0;
  const timers = new Map<number, { at: number; callback: () => void }>();

  return {
    setTimeout: (callback, delayMs) => {
      const id = nextId++;
      timers.set(id, { at: now + delayMs, callback });
      return id as unknown as TimerHandle;
    },
    clearTimeout: (handle) => {
      clearTimeoutCallCount += 1;
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
    get clearTimeoutCallCount() {
      return clearTimeoutCallCount;
    },
  };
};

type CreatePoolOptions = {
  maxConnections?: number;
  /** connect() throws for any url in this list, every call. */
  failing?: RelayUrl[];
  /** connection.subscribe() throws for any url in this list. */
  subscribeFailing?: RelayUrl[];
  /** Task 9: ジッタの決定性を保つための注入。既定は Math.random。 */
  random?: () => number;
  /**
   * Fix round 1 (Important 1, Important 3): per-url predicate deciding
   * whether the Nth `connect()` call for that url (0-indexed, counted
   * independently per url) should throw. Lets a single test build "fails
   * once then recovers" or "succeeds once then stays down forever" without
   * a bespoke `connect` mock -- both shapes matter for the reconnect logic
   * and neither is expressible with the always-fails `failing` list alone.
   */
  failWhen?: Partial<Record<RelayUrl, (callIndex: number) => boolean>>;
  /**
   * publish() を reject させる (relay がイベントを拒否した想定)。
   * `connection.publish()` の失敗をプールが握り潰さず forward することを
   * 確かめるためだけの注入 — 理由の文字列をそのまま呼び出し元へ伝えられる
   * ことも一緒に確認する。
   */
  publishFailing?: Partial<Record<RelayUrl, string>>;
  /**
   * publish() を一生 settle させない (final review, Critical 1)。実在する
   * リレーがレート制限中に EVENT フレームを黙って捨てる挙動の再現 — OK も
   * 来なければソケットが死にもしない。`ConnectionPool.publish()` 自身の
   * タイムアウトだけがこれを決着させられることを確かめるための注入。
   */
  publishSilent?: RelayUrl[];
};

const createPool = (options: CreatePoolOptions = {}) => {
  const connections = new Map<RelayUrl, FakeRelayConnection>();
  const connectCalls: RelayUrl[] = [];
  const failing = new Set(options.failing ?? []);
  const subscribeFailing = new Set(options.subscribeFailing ?? []);
  const clock = createFakeClock();
  const callIndexByUrl = new Map<RelayUrl, number>();

  const connect: ConnectionPoolOptions["connect"] = (url) => {
    const callIndex = callIndexByUrl.get(url) ?? 0;
    callIndexByUrl.set(url, callIndex + 1);
    connectCalls.push(url);
    const shouldFail =
      failing.has(url) || (options.failWhen?.[url]?.(callIndex) ?? false);
    if (shouldFail) {
      throw new Error(`connect failed for ${url} (call ${callIndex})`);
    }
    const relay = new FakeRelayConnection(url);
    if (subscribeFailing.has(url)) {
      const brokenSubscribe = () => {
        throw new Error(`subscribe failed for ${url}`);
      };
      // Override just the method under test; everything else stays the
      // real FakeRelayConnection behavior.
      Object.defineProperty(relay, "subscribe", { value: brokenSubscribe });
    }
    const publishFailReason = options.publishFailing?.[url];
    if (publishFailReason !== undefined) {
      const rejectingPublish = async () => {
        throw new Error(publishFailReason);
      };
      Object.defineProperty(relay, "publish", { value: rejectingPublish });
    }
    if (options.publishSilent?.includes(url)) {
      const neverSettlingPublish = () => new Promise<void>(() => {});
      Object.defineProperty(relay, "publish", {
        value: neverSettlingPublish,
      });
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

  // Task 12 fix round 1: `size` alone cannot prove a budget was respected,
  // because a connection that violated it and then died erases the evidence.
  // `peakSize` is the high-water mark taken at the moment each socket is
  // actually created, so it survives deaths.
  it("peakSize records the high-water mark and survives connections dying", () => {
    const { pool, connections } = createPool({ maxConnections: 2 });
    expect(pool.peakSize).toBe(0);

    pool.subscribe("wss://one/", [{ kinds: [1] }], noopHandlers());
    pool.subscribe("wss://two/", [{ kinds: [1] }], noopHandlers());
    expect(pool.peakSize).toBe(2);

    connections.get("wss://one/")?.die();
    connections.get("wss://two/")?.die();
    // size drops back to 0, but the peak must not follow it down.
    expect(pool.size).toBe(0);
    expect(pool.peakSize).toBe(2);
  });

  it("peakSize never exceeds the budget when the budget is enforced", () => {
    const { pool } = createPool({ maxConnections: 2 });
    pool.subscribe("wss://one/", [{ kinds: [1] }], noopHandlers());
    pool.subscribe("wss://two/", [{ kinds: [1] }], noopHandlers());
    // Refused: no new socket is created, so the peak must not move.
    pool.subscribe("wss://three/", [{ kinds: [1] }], noopHandlers());

    expect(pool.peakSize).toBe(2);
  });

  // ---------------------------------------------------------------------
  // Final whole-branch review, finding 9a: ADR-0025 and the design spec
  // both described bootstrap's `{ reserved: true }` as "pinned" -- it
  // isn't; `pinned` is a selectRelays concept, `reserved` bypasses
  // ConnectionPool's budget check entirely and never reaches selectRelays.
  // reservedSize exposes how many currently-live connections are open via
  // that bypass, so the discrepancy (and its "30 + reservedSize" peak
  // concurrency consequence) is at least observable instead of silent.
  // ---------------------------------------------------------------------
  it("reservedSize counts only currently-live connections opened via the reserved bypass", () => {
    const { pool, connections } = createPool({ maxConnections: 1 });
    expect(pool.reservedSize).toBe(0);

    // Fills the only ordinary budget slot.
    pool.subscribe("wss://ordinary/", [{ kinds: [1] }], noopHandlers());
    expect(pool.reservedSize).toBe(0);

    // Budget is already exhausted, but { reserved: true } opens anyway.
    pool.subscribe("wss://indexer/", [{ kinds: [10002] }], noopHandlers(), {
      reserved: true,
    });
    expect(pool.size).toBe(2); // over budget, by design, via the bypass
    expect(pool.reservedSize).toBe(1);

    // Dies -- no longer counted once it's not live, same as `size`.
    connections.get("wss://indexer/")?.die();
    expect(pool.reservedSize).toBe(0);
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

  // Fix round 1, Important 3: renamed from "caps the backoff at 60 seconds
  // and never gives up". Every reconnect here succeeds, so `attempts` resets
  // to 0 each cycle and the computed delay never exceeds ~1000ms across all
  // 12 cycles -- this proves only the "never gives up" half. Deleting the
  // cap or the exponent would not fail it. The cap and the doubling
  // themselves are proven by the next test, which drives consecutive
  // failures far enough to actually observe both.
  it("never gives up reconnecting after repeated deaths (does not stop after 8 attempts)", () => {
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

  // Fix round 1, Important 3: the test above only exercises the "never
  // gives up" half of the decision table, because every reconnect in it
  // succeeds (attempts resets to 0 each cycle, so the delay stays ~1000ms
  // throughout). This test drives *consecutive* connect() failures instead
  // -- the relay connects once, dies, and every reconnect attempt after
  // that fails -- so the backoff has to actually keep growing:
  // 1000 -> 2000 -> 4000 -> 8000 -> 16000 -> 32000 -> 60000 (cap) -> 60000
  // (still capped, proving it flattens rather than continuing to
  // 128000ms uncapped).
  it("doubles the backoff on each consecutive failure and flattens at the 60s cap", () => {
    let succeeded = false;
    const { pool, connections, connectCalls, clock } = createPool({
      random: () => 0.5,
      failWhen: {
        "wss://one/": () => {
          // Succeed exactly once (the initial subscribe()); every
          // subsequent connect() call -- i.e. every reconnect attempt --
          // fails, simulating a relay that stays down.
          if (!succeeded) {
            succeeded = true;
            return false;
          }
          return true;
        },
      },
    });
    pool.subscribe("wss://one/", [{ kinds: [1] }], noopHandlers());
    connections.get("wss://one/")?.die();

    const expectedDelays = [1000, 2000, 4000, 8000, 16000, 32000, 60000, 60000];
    let calls = 1; // the initial subscribe()'s connect()

    for (const delay of expectedDelays) {
      clock.advance(delay - 1);
      expect(connectCalls.length).toBe(calls); // not yet due
      clock.advance(1);
      calls += 1;
      expect(connectCalls.length).toBe(calls); // fired, and failed again
    }

    expect(pool.size).toBe(0);
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

    // Fix round 1, Important 4: `connectCalls` staying flat below is not by
    // itself proof the pending reconnect timer was cancelled -- #reconnect's
    // `!pooled` guard would make that hold even if #drop's clearTimeout call
    // were deleted outright (the dropped record is gone, so a leaked timer's
    // #reconnect call finds nothing and silently no-ops). Assert directly on
    // the scheduler that clearTimeout was actually invoked.
    const clearsBeforeClose = clock.clearTimeoutCallCount;
    sub?.close();
    expect(clock.clearTimeoutCallCount).toBe(clearsBeforeClose + 1);

    clock.advance(60_000);
    expect(connectCalls).toHaveLength(1);
  });

  // Fix round 1, Important 1: a relay whose very first connect() call fails
  // (as opposed to one that connected and later died) was not scheduled for
  // any retry at all -- ADR-0021 says "never give up", but a column dead
  // from the start degraded permanently while a column that died a second
  // after opening recovered forever. `subscribe()` must schedule a
  // reconnect for this case too, entirely on its own -- no external
  // replan() and no second subscribe() call from the caller.
  it("retries an initial connect() failure and recovers on its own, with no external replan() or new subscribe() call", () => {
    const { pool, connections, connectCalls, clock } = createPool({
      random: () => 0.5,
      failWhen: { "wss://one/": (callIndex) => callIndex === 0 },
    });

    const reasons: string[] = [];
    pool.subscribe("wss://one/", [{ kinds: [1], authors: ["abc"] }], {
      onEvent: () => {},
      onEose: () => {},
      onClosed: (reason) => reasons.push(reason),
    });

    // subscribe() stays total: the caller is told synchronously that the
    // relay is unavailable right now...
    expect(reasons).toEqual(["relay unavailable"]);
    expect(connectCalls).toEqual(["wss://one/"]);
    expect(pool.size).toBe(0);

    // ...but the entry is retained and a reconnect is scheduled on its own,
    // exactly like the post-death case.
    clock.advance(999);
    expect(connectCalls).toEqual(["wss://one/"]);
    clock.advance(1); // first backoff: 1000 * (0.5 + 0.5)

    expect(connectCalls).toEqual(["wss://one/", "wss://one/"]);
    expect(pool.size).toBe(1);
    // The original filter was re-issued unchanged on the relay that finally
    // accepted a connection.
    expect(connections.get("wss://one/")?.subscriptions[0].filters).toEqual([
      { kinds: [1], authors: ["abc"] },
    ]);
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

describe("ConnectionPool.publish()", () => {
  // Mutation caught: an implementation that calls `options.connect()`
  // directly for publish (bypassing `#ensureConnection`'s budget check)
  // would open this socket anyway and resolve. This must reject and must
  // not have opened a new connection.
  it("does not open a new socket past the budget, and rejects instead", async () => {
    const { pool, connectCalls } = createPool({ maxConnections: 1 });
    pool.subscribe("wss://one/", [{ kinds: [1] }], noopHandlers());
    expect(pool.size).toBe(1);

    await expect(pool.publish("wss://two/", fakeEvent("a"))).rejects.toThrow();

    // No socket was ever opened for "two" -- the budget check ran before
    // any connect() attempt, exactly like subscribe()'s.
    expect(connectCalls).toEqual(["wss://one/"]);
    expect(pool.size).toBe(1);
  });

  // Mutation caught: swallowing the budget-exhausted case and resolving
  // anyway (i.e. treating it as accepted) instead of surfacing it as a
  // rejection. ADR-0011 forbids hiding degradation -- publisher.ts relies on
  // this rejection to put the relay in `rejected`.
  it("never resolves when the budget is exhausted", async () => {
    const { pool } = createPool({ maxConnections: 1 });
    pool.subscribe("wss://one/", [{ kinds: [1] }], noopHandlers());

    let resolved = false;
    pool
      .publish("wss://two/", fakeEvent("a"))
      .then(() => {
        resolved = true;
      })
      .catch(() => {});

    await Promise.resolve();
    await Promise.resolve();
    expect(resolved).toBe(false);
  });

  it("reuses the socket an existing subscription already opened, instead of dialing a second one", async () => {
    const { pool, connectCalls, connections } = createPool();
    pool.subscribe("wss://one/", [{ kinds: [1] }], noopHandlers());

    await pool.publish("wss://one/", fakeEvent("a"));

    expect(connectCalls).toEqual(["wss://one/"]);
    expect(connections.get("wss://one/")?.published.map((e) => e.id)).toEqual([
      "a",
    ]);
  });

  it("opens a fresh socket for publish when nothing else is subscribed to that relay", async () => {
    const { pool, connections } = createPool();

    await pool.publish("wss://one/", fakeEvent("a"));

    expect(connections.get("wss://one/")?.published.map((e) => e.id)).toEqual([
      "a",
    ]);
  });

  it("releases the socket it opened for publish once settled, if nobody else needs it", async () => {
    const { pool } = createPool();

    await pool.publish("wss://one/", fakeEvent("a"));

    // Nothing was subscribed to "one" -- the connection publish() opened for
    // itself must not linger afterwards occupying a budget slot forever.
    expect(pool.size).toBe(0);
  });

  it("keeps the socket open after publish when a live subscription still needs it", async () => {
    const { pool } = createPool();
    const sub = pool.subscribe("wss://one/", [{ kinds: [1] }], noopHandlers());

    await pool.publish("wss://one/", fakeEvent("a"));

    // The subscription is still open, so publish() releasing its own
    // temporary reference must not tear the shared connection down.
    expect(pool.size).toBe(1);
    sub?.close();
    expect(pool.size).toBe(0);
  });

  // Mutation caught: catching connection.publish()'s rejection and
  // resolving anyway, or discarding the relay's reason. publisher.ts reads
  // `error.message` to build `PublishResult.rejected[].reason`.
  it("forwards the relay's rejection reason instead of swallowing it", async () => {
    const { pool } = createPool({
      publishFailing: { "wss://one/": "duplicate: already have this event" },
    });

    await expect(pool.publish("wss://one/", fakeEvent("a"))).rejects.toThrow(
      "duplicate: already have this event",
    );
  });

  it("releases the socket it opened even when the relay rejects the publish", async () => {
    const { pool } = createPool({
      publishFailing: { "wss://one/": "blocked: spam" },
    });

    await expect(pool.publish("wss://one/", fakeEvent("a"))).rejects.toThrow();

    expect(pool.size).toBe(0);
  });

  it("rejects when connect() itself fails, without throwing synchronously", async () => {
    const { pool } = createPool({ failing: ["wss://down/"] });

    await expect(pool.publish("wss://down/", fakeEvent("a"))).rejects.toThrow();
    expect(pool.size).toBe(0);
  });

  // -------------------------------------------------------------------
  // Critical 1 (final review): a relay that never sends OK and never dies
  // (NIP-01 says relays MUST send OK, but real relays drop EVENT frames
  // silently under rate limiting) must not pin a budget slot forever.
  // Without a timeout, `release()` -- which only runs from
  // `.then(onFulfilled, onRejected)` -- never runs, `pooled.entries` never
  // empties, and `#drop()` never runs: that socket holds one of the 30
  // slots for a relay nobody is subscribed to, and (since publisher.ts uses
  // Promise.allSettled and v1-preview.tsx awaits the whole publish) the
  // composer's `finally { setPosting(false) }` never runs either.
  // -------------------------------------------------------------------
  it("times out and releases the slot when the relay never sends OK or dies (Critical 1)", async () => {
    const { pool, clock } = createPool({
      maxConnections: 1,
      publishSilent: ["wss://one/"],
    });

    let settled = false;
    let rejection: unknown;
    pool
      .publish("wss://one/", fakeEvent("a"))
      .catch((error: unknown) => {
        rejection = error;
      })
      .finally(() => {
        settled = true;
      });

    await Promise.resolve();
    await Promise.resolve();
    // Still pending -- the relay has neither answered nor died.
    expect(settled).toBe(false);
    expect(pool.size).toBe(1);

    // Mutation caught: deleting the timeout entirely (or deleting its
    // `release()` call while keeping the `reject()`) leaves this pending,
    // or rejects without freeing the slot, forever.
    clock.advance(10_000);
    await Promise.resolve();
    await Promise.resolve();

    expect(settled).toBe(true);
    expect(rejection).toBeInstanceOf(Error);
    // The slot released -- this is what actually matters: a pinned slot
    // with a settled promise is just as much of a deadlock as a promise
    // that never settles, because the next subscribe() still gets refused.
    expect(pool.size).toBe(0);

    // The reproduction from the review: with the budget exhausted by the
    // silent relay, a later genuine subscribe() to a *different* relay was
    // refused for budget. Once the slot is actually released, it must not
    // be.
    expect(
      pool.subscribe("wss://two/", [{ kinds: [1] }], noopHandlers()),
    ).toBeDefined();
  });
});

// ---------------------------------------------------------------------
// Critical 2 (final review): reviving a connection that a subscription is
// waiting on must restore what was waiting on it, regardless of which path
// (`subscribe()` or `publish()`) does the reviving. Before this fix,
// `#ensureConnection` (publish's path into connection-opening) reconnected
// without clearing the pending backoff timer, resetting `attempts`, or
// re-issuing the REQs of entries already waiting on that URL -- so a
// column subscribed to a relay that died, then got revived by an unrelated
// publish() to the same relay, went dark forever: the backoff timer later
// fired, `#reconnect()` saw `pooled.connection` non-null and returned
// early (having already nulled `pooled.timer`, so nothing re-armed), and
// since the socket was now healthy `#onConnectionDied` never fired again
// either.
// ---------------------------------------------------------------------
describe("ConnectionPool: reviving a dead connection (Critical 2)", () => {
  it("re-issues a waiting subscription's REQ when publish() revives the connection before the backoff timer fires", async () => {
    const { pool, connections, connectCalls } = createPool({
      random: () => 0.5,
    });
    pool.subscribe(
      "wss://one/",
      [{ kinds: [1], authors: ["abc"] }],
      noopHandlers(),
    );
    expect(connectCalls).toEqual(["wss://one/"]);

    connections.get("wss://one/")?.die();
    // The backoff timer is armed but has not fired -- nothing has
    // reconnected yet.
    expect(connectCalls).toEqual(["wss://one/"]);

    // An unrelated publish() to the same relay revives the socket before
    // the subscription's own backoff timer ever fires.
    await pool.publish("wss://one/", fakeEvent("a"));
    expect(connectCalls).toEqual(["wss://one/", "wss://one/"]);

    // Mutation caught: reviving the connection in `#ensureConnection`
    // without re-issuing the waiting entry's REQ leaves this empty forever
    // -- exactly what the review found ("the revived socket had zero
    // subscriptions"). The column would be dark on this relay for the life
    // of the page.
    expect(connections.get("wss://one/")?.subscriptions[0]?.filters).toEqual([
      { kinds: [1], authors: ["abc"] },
    ]);
  });

  it("does not leave a zombie reconnect timer that later undoes the revival's bookkeeping", async () => {
    const { pool, connections, connectCalls, clock } = createPool({
      random: () => 0.5,
    });
    pool.subscribe("wss://one/", [{ kinds: [1] }], noopHandlers());
    connections.get("wss://one/")?.die();

    await pool.publish("wss://one/", fakeEvent("a"));
    expect(connectCalls).toEqual(["wss://one/", "wss://one/"]);

    // Advance well past the original backoff delay (1000ms * (0.5+0.5)).
    // Mutation caught: not clearing `pooled.timer` on revival leaves the
    // original backoff timer armed; if `attempts` was also left un-reset,
    // firing it would still no-op today only by accident (`#reconnect`'s
    // `pooled.connection` guard) -- but a leaked timer is exactly the kind
    // of latent bug ADR-0021's "never give up" accounting depends on not
    // having. No further connect() call should happen from this stale
    // timer.
    clock.advance(60_000);
    expect(connectCalls).toEqual(["wss://one/", "wss://one/"]);
  });
});
