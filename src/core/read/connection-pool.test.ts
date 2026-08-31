import { describe, expect, it, vi } from "vitest";
import type { NostrEvent } from "../nostr/event";
import { FakeRelayConnection } from "../relay/fake-relay-connection";
import type {
  RelaySubscriptionHandlers,
  RelayUrl,
} from "../relay/relay-connection";
import {
  ConnectionPool,
  type ConnectionPoolOptions,
  DEGRADED_COOLDOWN_MS,
} from "./connection-pool";

/**
 * `publish()` は署名検証をしない (`EventStore.put` の責務) ので、
 * id/sig は本物である必要が無い。
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

/** 手で進める偽スケジューラ。プールが実タイマーを掴んでいないことを型で示す。 */
// ハンドル型が `number` でないのは、@types/node 下では `NodeJS.Timeout` に
// 解決されるため —— `number` だと `vitest run` は通っても `tsc` が落ちる。
type TimerHandle = ReturnType<typeof setTimeout>;

type FakeClock = {
  setTimeout: (callback: () => void, delayMs: number) => TimerHandle;
  clearTimeout: (handle: TimerHandle) => void;
  now: () => number;
  advance(ms: number): void;
  /**
   * `clearTimeout` が実際に呼ばれた回数。`connectCalls` が増えないことは
   * タイマー解除の証拠にならないため、直接数えるのが唯一の証拠になる。
   */
  clearTimeoutCallCount: number;
  /**
   * `setTimeout` に渡された遅延を呼び出し順に記録する。`advance()` を
   * 繰り返さずにバックオフの倍加を直接検証できる。
   */
  readonly scheduledDelays: number[];
};

const createFakeClock = (): FakeClock => {
  let now = 0;
  let nextId = 1;
  let clearTimeoutCallCount = 0;
  const scheduledDelays: number[] = [];
  const timers = new Map<number, { at: number; callback: () => void }>();

  return {
    setTimeout: (callback, delayMs) => {
      const id = nextId++;
      scheduledDelays.push(delayMs);
      timers.set(id, { at: now + delayMs, callback });
      return id as unknown as TimerHandle;
    },
    clearTimeout: (handle) => {
      clearTimeoutCallCount += 1;
      timers.delete(handle as unknown as number);
    },
    now: () => now,
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
    scheduledDelays,
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
  /** ジッタの決定性を保つための注入。既定は Math.random。 */
  random?: () => number;
  /**
   * url ごとに N 回目の `connect()` を落とすか決める述語。「1 回失敗して
   * 復帰」「1 回成功して以後ずっと落ちる」の両方を単一のテストで作れる。
   */
  failWhen?: Partial<Record<RelayUrl, (callIndex: number) => boolean>>;
  /**
   * publish() を reject させる。プールが `connection.publish()` の失敗を
   * 握り潰さず、理由の文字列ごと forward することを確かめるための注入。
   */
  publishFailing?: Partial<Record<RelayUrl, string>>;
  /**
   * publish() を一生 settle させない (レート制限中に EVENT を黙って捨てる
   * relay の再現)。`publish()` 自身のタイムアウトだけがこれを決着させる。
   */
  publishSilent?: RelayUrl[];
  /**
   * ソケットは作れるが `onOpen` が発火しない、恒久的に到達不能なリレーを
   * 再現する。`.open()` を明示的に呼べば「実際に開いた」ことにできる。
   */
  neverOpens?: RelayUrl[];
};

const createPool = (options: CreatePoolOptions = {}) => {
  const connections = new Map<RelayUrl, FakeRelayConnection>();
  const connectCalls: RelayUrl[] = [];
  const failing = new Set(options.failing ?? []);
  const subscribeFailing = new Set(options.subscribeFailing ?? []);
  const neverOpens = new Set(options.neverOpens ?? []);
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
    const relay = new FakeRelayConnection(url, {
      autoOpen: !neverOpens.has(url),
    });
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

  // 同じ「全体クローズ」保証は、connect() ではなく connection.subscribe()
  // 自体が投げる場合 (別の失敗点) でも成り立たねばならない。
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

  // PooledSubscription.close() must be total — never throw, no matter how
  // many times it's called or in what order relative to dispose().
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

  // A relay whose connect() failed keeps its entry (for a later reconnect)
  // but must not occupy budget.
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

  // A socket that dies on its own (as opposed to being close()d by the
  // pool) must not keep occupying a budget slot.
  it("frees the slot when a connection dies on its own", () => {
    const { pool, connections } = createPool({ maxConnections: 1 });
    pool.subscribe("wss://one/", [{ kinds: [1] }], noopHandlers());
    expect(pool.size).toBe(1);

    connections.get("wss://one/")?.die();

    // A dead socket must not keep holding one of the 30 slots.
    expect(pool.size).toBe(0);
    expect(
      pool.subscribe("wss://two/", [{ kinds: [1] }], noopHandlers()),
    ).toBeDefined();
  });

  // `size` だけでは予算を守ったか証明できない (違反した接続が死ねば証拠が
  // 消える)。`peakSize` はソケットを作った瞬間の高水位マークなので、
  // 死んでも消えない。
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

  // `reserved` はいわゆる `pinned` (selectRelays 概念) とは別物 ——
  // 予算チェック自体を迂回し selectRelays には一切届かない。`reservedSize`
  // はその迂回によるライブ接続数を露出し、食い違いを観測可能にする。
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

  // 接続自身が既に配り終えている。二重に呼ぶと incomplete.unreachableRelays
  // が二重計上されるが、SectionReader.status は真偽値で見た目に現れない。
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

  // record の生存は `size` だけでは見えない (どちらも 0) ので、再
  // subscribe() が古いエントリを道連れにせず生き残ることで初めて観測できる。
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

  // Reconnection: 諦めない、指数バックオフ + ジッタは 60s で頭打ち、
  // 死んだ時点のエントリをそのまま張り直す (`since` backfill はしない)。

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

  // ここでは毎回再接続が成功するため delay は常に ~1000ms —— 「諦めない」
  // だけを証明する。cap や指数増加は次のテスト (連続失敗) が証明する。
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

  // 前のテストと違い、初回接続後は毎回 connect() が失敗し続けるので、
  // バックオフが 1000→...→60000 (cap) で頭打ちし、それ以上伸びないことを
  // 実際に確かめられる。
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

    // `connectCalls` が増えないことはタイマー解除の証拠にならない
    // (`#reconnect` の `!pooled` ガードが素通りしてしまうため) ので、
    // スケジューラに直接 clearTimeout の呼び出しを確認する。
    const clearsBeforeClose = clock.clearTimeoutCallCount;
    sub?.close();
    expect(clock.clearTimeoutCallCount).toBe(clearsBeforeClose + 1);

    clock.advance(60_000);
    expect(connectCalls).toHaveLength(1);
  });

  // 初回の connect() 失敗 (接続後に死んだ場合と違う) は、これが無いと
  // 一度も再試行が積まれず、開始直後から死んでいたカラムだけが永久に
  // degraded のままになる。
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

// 絶対にマッチしないフィルタの REQ で「開けたままにしておく」ことはでき
// ない (一部のリレーは `blocked` で CLOSE する)。`hold()` はワイヤに何も
// 出さずに接続の寿命だけを握る、専用の経路。
describe("ConnectionPool.hold()", () => {
  // 変異: hold() を subscribe() で実装すると落ちる。接続の保持はワイヤに
  // 何も出してはならない。
  it("opens the connection without sending any REQ", () => {
    const { pool, connections } = createPool();
    const held = pool.hold("wss://one/");

    expect(held).toBeDefined();
    expect(connections.get("wss://one/")?.subscriptions).toHaveLength(0);
    expect(pool.size).toBe(1);
  });

  // 変異: #drop の条件に holds を足し忘れると落ちる。これが hold() の
  // 存在理由そのもの (フェーズ間で接続を落とさない)。
  it("keeps the connection alive when the last subscription closes", () => {
    const { pool, connections } = createPool();
    pool.hold("wss://one/");
    const sub = pool.subscribe("wss://one/", [{ kinds: [1] }], noopHandlers());

    sub?.close();

    expect(connections.get("wss://one/")?.closed).toBe(false);
    expect(pool.size).toBe(1);
  });

  // 変異: release() で #drop を呼ばないと落ちる。
  it("closes the connection when the last hold is released and no entries remain", () => {
    const { pool, connections } = createPool();
    const held = pool.hold("wss://one/");

    held?.release();

    expect(connections.get("wss://one/")?.closed).toBe(true);
    expect(pool.size).toBe(0);
  });

  // 変異: release() を冪等にしないとカウントが負になり、後の hold が
  // 効かなくなる。
  it("is idempotent on repeated release()", () => {
    const { pool, connections } = createPool();
    const first = pool.hold("wss://one/");
    const second = pool.hold("wss://one/");

    first?.release();
    first?.release(); // double release must not double-decrement holds

    // The second hold is still outstanding. If the double release() above
    // had taken holds from 2 down to -1 (instead of stopping at 1 after the
    // first call), the connection would already be gone here.
    expect(connections.get("wss://one/")?.closed).toBe(false);
    expect(pool.size).toBe(1);

    second?.release();
    expect(connections.get("wss://one/")?.closed).toBe(true);
  });

  // 変異: #scheduleReconnect のガードに holds を足し忘れると落ちる。
  it("reconnects a url that has only a hold", () => {
    const { pool, connections, connectCalls, clock } = createPool({
      random: () => 0.5,
    });
    pool.hold("wss://one/");
    connections.get("wss://one/")?.die();

    clock.advance(999);
    expect(connectCalls).toHaveLength(1);
    clock.advance(1); // first backoff: 1000 * (0.5 + 0.5)
    expect(connectCalls).toHaveLength(2);
  });

  // 変異: 予算チェックを飛ばすと落ちる。
  it("returns undefined when the budget is full and reserved is not set", () => {
    const { pool } = createPool({ maxConnections: 1 });
    pool.subscribe("wss://one/", [{ kinds: [1] }], noopHandlers());

    expect(pool.hold("wss://two/")).toBeUndefined();
    expect(pool.size).toBe(1);
  });

  // 変異: release() の同一性チェック (current !== pooled) を消すと落ちる。
  // dispose() を挟んで同じ URL が開き直されると、古い release() が新しい
  // hold の枠を奪い、まだ握っている接続を落としてしまう。
  it("release() from a disposed pool entry does not drop a newer hold", () => {
    const { pool } = createPool();
    const stale = pool.hold("wss://one/");
    pool.dispose();

    const fresh = pool.hold("wss://one/");
    expect(pool.size).toBe(1);

    stale?.release();

    // fresh はまだ握っているので、接続は生きていなければならない。
    expect(pool.size).toBe(1);

    fresh?.release();
    expect(pool.size).toBe(0);
  });

  // 変異: hold() の #ensureConnection 呼び出しから options を落とすと
  // 落ちる。ブートストラップの予算迂回が hold() に効かなくなり、
  // 予算が埋まっている間はインデクサを握れなくなる。
  it("bypasses the budget with { reserved: true }, same as subscribe()", () => {
    const { pool } = createPool({ maxConnections: 1 });
    pool.subscribe("wss://one/", [{ kinds: [1] }], noopHandlers());
    expect(pool.size).toBe(1);

    const held = pool.hold("wss://indexer/", { reserved: true });

    expect(held).toBeDefined();
    expect(pool.size).toBe(2); // over budget, by design, via the bypass
    expect(pool.reservedSize).toBe(1);
  });

  // subscribe() と対称の保証: 初回 connect() 失敗でも自力で再試行する。
  // hold() の `!pooled.connection` 分岐がこれを怠ると、hold のみで開いた
  // 不能な relay は二度と #scheduleReconnect が呼ばれず置き去りになる。
  it("retries an initial connect() failure for a hold-only url and recovers on its own", () => {
    const { pool, connectCalls, clock } = createPool({
      random: () => 0.5,
      failWhen: { "wss://one/": (callIndex) => callIndex === 0 },
    });

    const held = pool.hold("wss://one/");
    expect(held).toBeDefined();
    expect(connectCalls).toEqual(["wss://one/"]);
    expect(pool.size).toBe(0);

    clock.advance(999);
    expect(connectCalls).toEqual(["wss://one/"]);
    clock.advance(1); // first backoff: 1000 * (0.5 + 0.5)

    expect(connectCalls).toEqual(["wss://one/", "wss://one/"]);
    expect(pool.size).toBe(1);
  });

  // publish() 内の 2 箇所の `entries.size === 0` ガード (cleanup と
  // release()) は、hold()/publish() が同じ URL に絡む場面が無いため上の
  // テスト群のどれも通らない。ここで個別に確かめる。
  describe("interaction with publish()", () => {
    // guard: publish() の release() の `&& current.holds === 0`。
    // 変異: これを削ると落ちる。
    it("keeps the connection alive after publish() releases its temporary entry, when a hold still needs it", async () => {
      const { pool, connections } = createPool();
      pool.hold("wss://one/");

      await pool.publish("wss://one/", fakeEvent("a"));

      // publish() が自分の一時エントリを release() した後も、hold がまだ
      // この接続を必要としている。
      expect(connections.get("wss://one/")?.closed).toBe(false);
      expect(pool.size).toBe(1);
    });

    // guard: publish() の「connect() 失敗後の cleanup」の
    // `&& pooled.holds === 0`。変異: これを削ると落ちる。
    it("keeps a hold-only pool record (and its pending reconnect timer) alive when publish() also fails to connect", async () => {
      const { pool, connectCalls, clock } = createPool({
        failing: ["wss://one/"],
        random: () => 0.5,
      });

      // hold() 自身の connect() が失敗し、独自に #scheduleReconnect で
      // タイマーを積む (この URL には subscribe() 由来のエントリが無い)。
      pool.hold("wss://one/");
      expect(connectCalls).toEqual(["wss://one/"]);

      // publish() も同じ URL への connect() を試みて、同じく失敗する。
      await expect(
        pool.publish("wss://one/", fakeEvent("a")),
      ).rejects.toThrow();
      expect(connectCalls).toEqual(["wss://one/", "wss://one/"]);

      // 再接続タイマーがまだ生きている証拠: 進めると connect() が再試行
      // される。cleanup が entries だけで判断し record ごと消していたら、
      // この `#reconnect` は `#pool.get(url)` で何も見つからず無言で
      // 何もしないままになる。
      clock.advance(999);
      expect(connectCalls).toEqual(["wss://one/", "wss://one/"]);
      clock.advance(1); // first backoff: 1000 * (0.5 + 0.5)
      expect(connectCalls).toEqual(["wss://one/", "wss://one/", "wss://one/"]);
    });
  });
});

describe("ConnectionPool.publish()", () => {
  // Mutation: publish() が `#ensureConnection` の予算チェックを迂回して
  // `options.connect()` を直接呼ぶと、このソケットは開いて resolve して
  // しまう。reject し、新しい接続も開かないことを確かめる。
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

  // Mutation: 予算超過を握り潰して resolve してしまうと、publisher.ts が
  // reject に依存してリレーを `rejected` に分類する処理が壊れる。
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

  // NIP-01 は OK 送信を relay に義務づけるが、実際のリレーはレート制限中に
  // EVENT を黙って捨てる。タイムアウトが無いと `release()` は一生走らず、
  // ソケットが 30 枠の 1 つを永久に握ったまま、composer の
  // `finally { setPosting(false) }` も一生走らない。
  it("times out and releases the slot when the relay never sends OK or dies", async () => {
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

    // 予算が埋まった状態で別のリレーへの subscribe() が拒否される再現。
    // 枠が実際に解放された後は拒否されてはならない。
    expect(
      pool.subscribe("wss://two/", [{ kinds: [1] }], noopHandlers()),
    ).toBeDefined();
  });
});

// 蘇生させたのが subscribe()/publish() どちらであっても同じ後始末が要る
// (`#attachConnection` 参照) —— 怠るとカラムは REQ を二度と送れず沈黙する。
describe("ConnectionPool: reviving a dead connection", () => {
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
    // without re-issuing the waiting entry's REQ leaves this empty forever.
    // The column would be dark on this relay for the life of the page.
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

    // The death armed a backoff timer. Count clears from here: the only
    // thing that may clear a timer between this point and the assertion is
    // `#attachConnection` cancelling that pending backoff on revival.
    const clearsBeforeRevival = clock.clearTimeoutCallCount;

    await pool.publish("wss://one/", fakeEvent("a"));
    expect(connectCalls).toEqual(["wss://one/", "wss://one/"]);

    // Mutation: delete the `pooled.timer` teardown at the top of
    // `#attachConnection`。`#reconnect()` の `pooled.connection` ガードが
    // 漏れたタイマーを無害化するため、`connectCalls` の観測だけでは
    // 検出できない —— clearTimeout の直接カウントだけが証拠になる。
    //
    // +3 の内訳: (1) `pooled.timer` (再接続バックオフ) の解除、
    // (2) `#failures` のクールダウンタイマー (`onOpen` が
    // `#attachConnection` 内で同期発火するため即座に `#clearFailures`)、
    // (3) `publish()` 自身の `PUBLISH_TIMEOUT_MS`。
    expect(clock.clearTimeoutCallCount).toBe(clearsBeforeRevival + 3);

    // And the original assertion: no stale timer ever fires a reconnect.
    clock.advance(60_000);
    expect(connectCalls).toEqual(["wss://one/", "wss://one/"]);
  });

  // #attachConnection の再アタッチループの隔離 (#attachConnection 参照)。
  // `subscribeFailing` は初回の subscribe() 自体も失敗させる (無関係) ので、
  // `shouldThrow` は die()/retryNow() がループを両エントリに回すときだけ
  // 発火させる。
  it("isolates a throwing onClosed so the remaining entries are still re-attached", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { pool, connections } = createPool({
      subscribeFailing: ["wss://one/"],
    });

    const seen: string[] = [];
    let shouldThrow = false;
    pool.subscribe("wss://one/", [{ kinds: [1] }], {
      ...noopHandlers(),
      onClosed: () => {
        seen.push("first");
        if (shouldThrow) throw new Error("consumer blew up");
      },
    });
    pool.subscribe("wss://one/", [{ kinds: [2] }], {
      ...noopHandlers(),
      onClosed: () => {
        seen.push("second");
      },
    });
    // The two subscribe() calls above already delivered their own
    // "relay unavailable" report each, independently of the loop under
    // test -- clear that noise before arming the throw.
    seen.length = 0;
    shouldThrow = true;

    // retryNow() を使うのは、ジッタに依存せず `#reconnect` を同期的に
    // 駆動できるため。
    connections.get("wss://one/")?.die();
    pool.retryNow();

    expect(seen).toEqual(["first", "second"]);
    errorSpy.mockRestore();
  });
});

// 失敗カウンタは実際に開いた (`onOpen`) 時だけリセットする —— `connect()` が
// 返しただけでは「開いた」ことにならない (理由は接続プール側のコメント
// 参照)。`neverOpens` はソケットは作れるが `onOpen` が発火しないリレーを
// 再現する。
describe("backoff growth and degraded relays", () => {
  // Mutation: `#clearFailures` を `onOpen` 内ではなく無条件に呼ぶよう戻す
  // と、一度も開かないリレーでもバックオフが毎回リセットされ、遅延が
  // base を超えて伸びなくなる。
  it("grows the delay when the socket never actually opens", () => {
    const { pool, connections, clock } = createPool({
      random: () => 0.5,
      neverOpens: ["wss://one/"],
    });
    pool.subscribe("wss://one/", [{ kinds: [1] }], noopHandlers());

    // Every noted failure also (re-)arms the DEGRADED_COOLDOWN_MS timer
    // (see the "postpones the cooldown" test below) -- filter those out so
    // this only looks at the reconnect backoff itself.
    const reconnectDelays = () =>
      clock.scheduledDelays.filter((d) => d !== DEGRADED_COOLDOWN_MS);

    // The initial socket never opens; kill it to trigger the first
    // reconnect scheduling.
    connections.get("wss://one/")?.die();
    expect(reconnectDelays()).toEqual([1000]); // base * (0.5 + 0.5)

    // Let the first backoff fire. The reconnect attempt creates a fresh
    // socket that -- being wss://one/ -- also never opens. Kill it too.
    clock.advance(1000);
    connections.get("wss://one/")?.die();

    // The second delay must be exactly double the first: the exponent grew
    // from 2^0 to 2^1. Under the bug, both entries would read [1000, 1000].
    expect(reconnectDelays()).toEqual([1000, 2000]);
  });

  // Mutation: `connect()` の成功時点でリセットする (`onOpen` 発火を待たない)
  // よう戻すと同じ穴が開く。逆に、実際に開いた後は次の失敗が base から
  // 再スタートすることも同時に確認する (正のケース)。
  it("resets the delay to the base once the socket really opens", () => {
    const { pool, connections, clock } = createPool({
      random: () => 0.5,
      neverOpens: ["wss://one/"],
    });
    pool.subscribe("wss://one/", [{ kinds: [1] }], noopHandlers());

    const reconnectDelays = () =>
      clock.scheduledDelays.filter((d) => d !== DEGRADED_COOLDOWN_MS);

    connections.get("wss://one/")?.die();
    clock.advance(1000);
    connections.get("wss://one/")?.die();
    expect(reconnectDelays()).toEqual([1000, 2000]); // grown, as above

    // Let the third reconnect attempt fire, but this time let the socket
    // really open before killing it.
    clock.advance(2000);
    connections.get("wss://one/")?.open();
    connections.get("wss://one/")?.die();

    // A real open cleared the failure history, so this delay is base again
    // -- not 4000 (2^2), which is what continuing the sequence would give.
    expect(reconnectDelays()).toEqual([1000, 2000, 1000]);
  });

  // Mutation: `#failures` を `Pooled` へ戻すと、degraded な relay が選択から
  // 外れて最後の購読が閉じ `#drop` が走った瞬間に履歴が消え、再選択された
  // 途端に新品に見えてしまう (振動)。このテストはその防止を守る。
  it("remembers failures across a drop of the pool entry", () => {
    const { pool, connections, clock } = createPool({
      random: () => 0.5,
      neverOpens: ["wss://one/"],
    });
    const sub = pool.subscribe("wss://one/", [{ kinds: [1] }], noopHandlers());

    const reconnectDelays = () =>
      clock.scheduledDelays.filter((d) => d !== DEGRADED_COOLDOWN_MS);

    connections.get("wss://one/")?.die();
    clock.advance(1000);
    connections.get("wss://one/")?.die();
    clock.advance(2000);
    connections.get("wss://one/")?.die();
    expect(reconnectDelays()).toEqual([1000, 2000, 4000]); // 3 failures

    // Close the only subscription -- entries.size drops to 0, so `#drop`
    // tears down the pooled record entirely (the connection, the pending
    // timer, everything except the failure history).
    sub?.close();

    // Subscribe to the same URL again (a fresh `Pooled` record is created)
    // and kill it once more.
    pool.subscribe("wss://one/", [{ kinds: [1] }], noopHandlers());
    connections.get("wss://one/")?.die();

    // If the counter had been reset by the drop, this delay would be back
    // at the base (1000ms). It must instead continue from count=3:
    // 1000 * 2^3 = 8000ms.
    expect(reconnectDelays()).toEqual([1000, 2000, 4000, 8000]);
  });

  // Mutation: change the `degradedRelays` threshold check from `>=` to `>`,
  // or change `DEGRADED_AFTER_FAILURES` from 4 to 5.
  it("reports a url as degraded only after DEGRADED_AFTER_FAILURES failures", () => {
    const { pool, connections, clock } = createPool({
      random: () => 0.5,
      neverOpens: ["wss://one/"],
    });
    pool.subscribe("wss://one/", [{ kinds: [1] }], noopHandlers());

    connections.get("wss://one/")?.die(); // failure 1
    clock.advance(1000);
    connections.get("wss://one/")?.die(); // failure 2
    clock.advance(2000);
    connections.get("wss://one/")?.die(); // failure 3

    expect(pool.degradedRelays).toEqual([]);

    clock.advance(4000);
    connections.get("wss://one/")?.die(); // failure 4

    expect(pool.degradedRelays).toEqual(["wss://one/"]);
  });

  // Mutation: delete the record-clearing call inside the `onOpen` callback
  // in `#attachConnection` (leaving the failure history, and therefore the
  // degraded status, stuck even after the relay proves it can open again).
  it("clears degraded once the relay opens again", () => {
    const { pool, connections, clock } = createPool({
      random: () => 0.5,
      neverOpens: ["wss://one/"],
    });
    pool.subscribe("wss://one/", [{ kinds: [1] }], noopHandlers());

    connections.get("wss://one/")?.die();
    clock.advance(1000);
    connections.get("wss://one/")?.die();
    clock.advance(2000);
    connections.get("wss://one/")?.die();
    clock.advance(4000);
    connections.get("wss://one/")?.die(); // 4th failure -> degraded
    expect(pool.degradedRelays).toEqual(["wss://one/"]);

    clock.advance(8000); // 5th reconnect attempt fires, socket created
    connections.get("wss://one/")?.open(); // this time it actually opens

    expect(pool.degradedRelays).toEqual([]);
  });

  // Mutation: 失敗を記録する際にクールダウンタイマーを張らないと、degraded
  // な URL は購読者が居ないため `#scheduleReconnect` も二度と走らず、
  // 戻る経路が無くなり永久に除外されたままになる。
  it("clears degraded after the cooldown elapses with no further failures", () => {
    const { pool, connections, clock } = createPool({
      random: () => 0.5,
      neverOpens: ["wss://one/"],
    });
    const sub = pool.subscribe("wss://one/", [{ kinds: [1] }], noopHandlers());

    connections.get("wss://one/")?.die();
    clock.advance(1000);
    connections.get("wss://one/")?.die();
    clock.advance(2000);
    connections.get("wss://one/")?.die();
    clock.advance(4000);
    connections.get("wss://one/")?.die(); // 4th failure -> degraded
    expect(pool.degradedRelays).toEqual(["wss://one/"]);

    // Nobody is subscribed any more -- with the pooled record dropped and
    // no entries waiting, reconnection stops. The cooldown timer armed by
    // the 4th failure is the only path back to non-degraded.
    sub?.close();

    clock.advance(DEGRADED_COOLDOWN_MS);
    expect(pool.degradedRelays).toEqual([]);
  });

  // Mutation: クールダウンのコールバックを素の `#failures.delete(url)` に
  // 戻しても `degradedRelays` からは消えるので既存のテストは通る ——
  // 通知されないことだけは、このテストしか検出できない。
  it("notifies when a url leaves the degraded set after the cooldown", () => {
    const { pool, connections, clock } = createPool({
      random: () => 0.5,
      neverOpens: ["wss://one/"],
    });
    const changed: RelayUrl[] = [];
    pool.onDegradedChanged((url) => changed.push(url));
    const sub = pool.subscribe("wss://one/", [{ kinds: [1] }], noopHandlers());

    connections.get("wss://one/")?.die();
    clock.advance(1000);
    connections.get("wss://one/")?.die();
    clock.advance(2000);
    connections.get("wss://one/")?.die();
    clock.advance(4000);
    connections.get("wss://one/")?.die(); // 4th failure -> degraded
    expect(changed).toEqual(["wss://one/"]); // the entry crossing

    sub?.close(); // nobody is waiting; only the cooldown can clear it now

    clock.advance(DEGRADED_COOLDOWN_MS);
    expect(pool.degradedRelays).toEqual([]);
    expect(changed).toEqual(["wss://one/", "wss://one/"]); // and the exit
  });

  // Mutation: drop the notification from `#clearFailures` (keep the delete).
  // A relay that proves it can open again would silently stay excluded from
  // selection until an unrelated replan happened to run.
  it("notifies when a degraded url's socket actually opens", () => {
    const { pool, connections, clock } = createPool({
      random: () => 0.5,
      neverOpens: ["wss://one/"],
    });
    const changed: RelayUrl[] = [];
    pool.onDegradedChanged((url) => changed.push(url));
    pool.subscribe("wss://one/", [{ kinds: [1] }], noopHandlers());

    connections.get("wss://one/")?.die();
    clock.advance(1000);
    connections.get("wss://one/")?.die();
    clock.advance(2000);
    connections.get("wss://one/")?.die();
    clock.advance(4000);
    connections.get("wss://one/")?.die(); // 4th failure -> degraded

    clock.advance(8000); // the 5th reconnect attempt creates a socket
    connections.get("wss://one/")?.open(); // this time it really opens

    expect(pool.degradedRelays).toEqual([]);
    expect(changed).toEqual(["wss://one/", "wss://one/"]);
  });

  // Mutation: `#clearFailures` のガード (`hard >= DEGRADED_AFTER_FAILURES`)
  // を外すと、1 回失敗して開き直しただけの日常的なブリップでも replan が
  // 発火してしまう。
  it("does not notify when a url that never degraded loses its history", () => {
    const { pool, connections, clock } = createPool({
      random: () => 0.5,
      neverOpens: ["wss://one/"],
    });
    const changed: RelayUrl[] = [];
    pool.onDegradedChanged((url) => changed.push(url));
    pool.subscribe("wss://one/", [{ kinds: [1] }], noopHandlers());

    connections.get("wss://one/")?.die(); // a single failure: not degraded
    clock.advance(1000);
    connections.get("wss://one/")?.open(); // and it comes straight back

    expect(pool.degradedRelays).toEqual([]);
    expect(changed).toEqual([]);
  });

  // Mutation: dispose() の失敗履歴の後始末を `#clearFailures` 経由にすると、
  // disposal は復帰ではなく再選択すべきプールも無いのに、既に owner を
  // 失った listener へ通知してしまう。
  it("does not notify on dispose()", () => {
    const { pool, connections, clock } = createPool({
      random: () => 0.5,
      neverOpens: ["wss://one/"],
    });
    const changed: RelayUrl[] = [];
    pool.onDegradedChanged((url) => changed.push(url));
    pool.subscribe("wss://one/", [{ kinds: [1] }], noopHandlers());

    connections.get("wss://one/")?.die();
    clock.advance(1000);
    connections.get("wss://one/")?.die();
    clock.advance(2000);
    connections.get("wss://one/")?.die();
    clock.advance(4000);
    connections.get("wss://one/")?.die(); // 4th failure -> degraded
    expect(changed).toEqual(["wss://one/"]);

    pool.dispose();
    expect(changed).toEqual(["wss://one/"]); // no exit notification
  });

  // Mutation: 初回の失敗でだけクールダウンタイマーを張り、以後は張り直さ
  // ないと、失敗し続けている最中でも最初の失敗時刻を起点に degraded 判定
  // が解除されてしまう。
  it("postpones the cooldown on each new failure", () => {
    const { pool, connections, clock } = createPool({
      random: () => 0.5,
      neverOpens: ["wss://one/"],
    });
    const sub = pool.subscribe("wss://one/", [{ kinds: [1] }], noopHandlers());

    connections.get("wss://one/")?.die(); // failure 1, at t=0
    clock.advance(1000); // t=1000
    connections.get("wss://one/")?.die(); // failure 2
    clock.advance(2000); // t=3000
    connections.get("wss://one/")?.die(); // failure 3
    clock.advance(4000); // t=7000
    connections.get("wss://one/")?.die(); // failure 4 -> degraded, at t=7000
    expect(pool.degradedRelays).toEqual(["wss://one/"]);

    sub?.close(); // stop reconnecting; only the cooldown can clear it now

    // If the cooldown were not postponed by the 4th failure (i.e. it still
    // measured 300s from the 1st failure at t=0), it would already have
    // elapsed inside this very advance() call (t=0+300_000 < 7000+299_999).
    clock.advance(DEGRADED_COOLDOWN_MS - 1); // t = 7000 + 299_999 = 306_999
    expect(pool.degradedRelays).toEqual(["wss://one/"]);

    clock.advance(1); // t = 307_000 = the 4th failure's own cooldown target
    expect(pool.degradedRelays).toEqual([]);
  });
});

// `degradedRelays` を誰も継続的に読まないので、`replan()` を起こすには
// 交差した瞬間の通知が要る (ポーリングではなく)。`onDegradedChanged` が
// それで、集合への出入り両方で発火する。バッチ処理は
// `subscription-manager.test.ts` 側の責務。
describe("ConnectionPool.onDegradedChanged", () => {
  // Mutation: fire the listener on every `#noteFailure` call instead of only
  // the one that pushes `hard` across `DEGRADED_AFTER_FAILURES` -- this is
  // the "crossing, not level" distinction this notification exists to make.
  it("fires exactly once, at the failure that crosses DEGRADED_AFTER_FAILURES", () => {
    const { pool, connections, clock } = createPool({
      random: () => 0.5,
      neverOpens: ["wss://one/"],
    });
    pool.subscribe("wss://one/", [{ kinds: [1] }], noopHandlers());

    const crossings: RelayUrl[] = [];
    pool.onDegradedChanged((url) => crossings.push(url));

    connections.get("wss://one/")?.die(); // failure 1
    clock.advance(1000);
    connections.get("wss://one/")?.die(); // failure 2
    clock.advance(2000);
    connections.get("wss://one/")?.die(); // failure 3
    expect(crossings).toEqual([]);

    clock.advance(4000);
    connections.get("wss://one/")?.die(); // failure 4 -> crosses
    expect(crossings).toEqual(["wss://one/"]);
  });

  // Mutation: `previousHard < DEGRADED_AFTER_FAILURES` ガードを外すと、
  // 既に degraded な URL の以後の失敗ごとに発火してしまい、「交差ごとに
  // 1 回」ではなく「失敗ごとに replan」というバースト状態を招く。
  it("does not fire again for failures after the crossing", () => {
    const { pool, connections, clock } = createPool({
      random: () => 0.5,
      neverOpens: ["wss://one/"],
    });
    const sub = pool.subscribe("wss://one/", [{ kinds: [1] }], noopHandlers());

    const crossings: RelayUrl[] = [];
    pool.onDegradedChanged((url) => crossings.push(url));

    connections.get("wss://one/")?.die(); // failure 1
    clock.advance(1000);
    connections.get("wss://one/")?.die(); // failure 2
    clock.advance(2000);
    connections.get("wss://one/")?.die(); // failure 3
    clock.advance(4000);
    connections.get("wss://one/")?.die(); // failure 4 -> crosses
    expect(crossings).toEqual(["wss://one/"]);

    // Force a 5th relay-attributable failure without ever clearing
    // `#failures` (no open, no retryNow(), no cooldown elapsed) -- `hard`
    // keeps growing past the threshold it already crossed.
    sub?.close(); // drop the pooled record so a fresh subscribe() reconnects
    pool.subscribe("wss://one/", [{ kinds: [1] }], noopHandlers());
    connections.get("wss://one/")?.die(); // failure 5, still degraded

    expect(crossings).toEqual(["wss://one/"]); // still just the one crossing
  });

  // Mutation: make the returned unsubscribe function a no-op.
  it("stops notifying after the returned unsubscribe is called", () => {
    const { pool, connections, clock } = createPool({
      random: () => 0.5,
      neverOpens: ["wss://one/"],
    });
    pool.subscribe("wss://one/", [{ kinds: [1] }], noopHandlers());

    const crossings: RelayUrl[] = [];
    const off = pool.onDegradedChanged((url) => crossings.push(url));
    off();

    connections.get("wss://one/")?.die();
    clock.advance(1000);
    connections.get("wss://one/")?.die();
    clock.advance(2000);
    connections.get("wss://one/")?.die();
    clock.advance(4000);
    connections.get("wss://one/")?.die(); // would cross, if still subscribed

    expect(crossings).toEqual([]);
    expect(pool.degradedRelays).toEqual(["wss://one/"]); // the state itself is unaffected
  });

  // `#notifyDegradedChanged` を素の for ループにすると `subscribe()` の
  // 「例外を投げない」保証を破る (#attachConnection と同じ形)。再現に
  // connect() の失敗を使うのは、4 回目の交差を新しい `subscribe()` 呼び出し
  // の中で同期的に起こすため。
  it("isolates a throwing onDegradedChanged listener so subscribe() stays total and later listeners still hear the crossing", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { pool, clock } = createPool({
      random: () => 0.5,
      failing: ["wss://one/"],
    });

    // Failure 1: the initial subscribe()'s own connect() throws.
    const sub = pool.subscribe("wss://one/", [{ kinds: [1] }], noopHandlers());
    // Failure 2: the first backoff-driven reconnect attempt also fails.
    clock.advance(1000);
    // Failure 3: same again.
    clock.advance(2000);
    expect(pool.degradedRelays).toEqual([]); // 3 so far -- not yet degraded

    // Drops the Pooled record (connection is still null, mid-backoff) --
    // #failures (hard=3) survives, by design.
    sub?.close();

    pool.onDegradedChanged(() => {
      throw new Error("first listener blew up");
    });
    const seenByOther: RelayUrl[] = [];
    pool.onDegradedChanged((url) => seenByOther.push(url));

    // The 4th relay-caused failure -- and the crossing it triggers -- both
    // happen synchronously inside this call.
    expect(() =>
      pool.subscribe("wss://one/", [{ kinds: [1] }], noopHandlers()),
    ).not.toThrow();

    expect(seenByOther).toEqual(["wss://one/"]);
    errorSpy.mockRestore();
  });
});

// budget 由来のバウンスは relay の健全性と無関係 (`ReconnectReason` 参照)、
// dispose() は `#failures` も掃除しないと実タイマーが漏れる (`dispose()`
// 参照)、retryNow() は Pooled レコードが無い degraded URL にも届く必要が
// ある (`retryNow()` 参照) —— この 3 点をまとめて検証する。
describe("budget vs relay health, and cleanup", () => {
  // Mutation A: `reason === "relay"` チェックを外すと、予算超過で待たされ
  // ただけの健全なリレーまで degraded になる。Mutation B: budget 経路で
  // `#noteFailure` 自体を飛ばすと、バックオフが伸びず base 間隔で回り続け
  // る。両方をこの下で確認する。
  it("does not count budget-exhaustion bounces as relay failures, but still grows the backoff", () => {
    const { pool, connections, clock } = createPool({
      maxConnections: 1,
      random: () => 0.5,
    });
    const reconnectDelays = () =>
      clock.scheduledDelays.filter((d) => d !== DEGRADED_COOLDOWN_MS);

    pool.subscribe("wss://a/", [{ kinds: [1] }], noopHandlers());
    connections.get("wss://a/")?.die(); // A's own, single, genuine failure
    expect(reconnectDelays()).toEqual([1000]);

    // B takes the freed slot and holds it for the rest of the test --
    // from here on, wss://a/'s connect() is never even attempted again.
    pool.subscribe("wss://b/", [{ kinds: [1] }], noopHandlers());
    expect(pool.size).toBe(1);

    // A's pending reconnect timer fires, finds the budget full (B holds
    // the only slot), and reschedules -- a budget bounce, not a relay
    // failure.
    clock.advance(1000);
    expect(reconnectDelays()).toEqual([1000, 2000]);

    clock.advance(2000);
    expect(reconnectDelays()).toEqual([1000, 2000, 4000]);

    clock.advance(4000);
    expect(reconnectDelays()).toEqual([1000, 2000, 4000, 8000]);

    // The backoff grew across all 4 bounces (1 real death + 3 budget
    // bounces) -- but degradedRelays must not include A: every count
    // after the first came from the budget guard, not from the relay.
    expect(pool.degradedRelays).toEqual([]);
  });

  // Mutation: dispose() から `#failures` の後始末ループを消すと、
  // 再接続タイマーは `#drop` で消えるが冷却タイマーは残る —— 実タイマー
  // なら最大 `DEGRADED_COOLDOWN_MS` 分プールをクロージャ越しに漏らし、
  // 偽クロックなら dispose 済みプールを後から書き換えてしまう。
  it("clears every failure cooldown timer on dispose()", () => {
    const { pool, connections, clock } = createPool({
      random: () => 0.5,
      neverOpens: ["wss://one/"],
    });
    pool.subscribe("wss://one/", [{ kinds: [1] }], noopHandlers());
    // Arms both a pending reconnect timer (pooled.timer) and a failure
    // cooldown timer (#failures' timer).
    connections.get("wss://one/")?.die();

    const clearsBeforeDispose = clock.clearTimeoutCallCount;
    pool.dispose();

    // Two clearTimeout calls are expected: the pre-existing one for the
    // pending reconnect timer (via #drop, already covered by an earlier
    // test) and the new one for the failure's cooldown timer.
    expect(clock.clearTimeoutCallCount).toBe(clearsBeforeDispose + 2);

    // Advancing the clock well past the cooldown must not resurrect
    // anything -- if the timer had leaked, its callback would still fire
    // here and mutate #failures on a disposed pool.
    expect(() => clock.advance(DEGRADED_COOLDOWN_MS)).not.toThrow();
    expect(pool.degradedRelays).toEqual([]);
  });

  // Mutation: retryNow() が `#pool` ループ経由でしか失敗履歴を消さないと
  // (この修正が足す `#failures.clear()` を外すと)、最後の購読者が既に
  // 閉じて Pooled レコードが無い degraded URL に届かず、人間が復帰して
  // retry しても一番必要な URL だけ除外されたままになる。
  it("retryNow() clears a degraded URL's failure history even after its Pooled record is gone", () => {
    const { pool, connections, clock } = createPool({
      random: () => 0.5,
      neverOpens: ["wss://one/"],
    });
    const sub = pool.subscribe("wss://one/", [{ kinds: [1] }], noopHandlers());

    connections.get("wss://one/")?.die();
    clock.advance(1000);
    connections.get("wss://one/")?.die();
    clock.advance(2000);
    connections.get("wss://one/")?.die();
    clock.advance(4000);
    connections.get("wss://one/")?.die(); // 4th failure -> degraded
    expect(pool.degradedRelays).toEqual(["wss://one/"]);

    // The URL's last subscriber closes -- #drop tears the Pooled record
    // down entirely, but the failure history survives on purpose (that's
    // the point of keeping it off Pooled).
    sub?.close();
    expect(pool.degradedRelays).toEqual(["wss://one/"]); // still degraded

    pool.retryNow();

    expect(pool.degradedRelays).toEqual([]);
  });
});
