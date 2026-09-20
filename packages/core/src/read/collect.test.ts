import { describe, expect, it, vi } from "vitest";
import { FakeRelayConnection } from "../relay/fake-relay-connection";
import type { RelayUrl } from "../relay/relay-connection";
import { collect } from "./collect";
import { ConnectionPool, type PooledSubscription } from "./connection-pool";
import { EventStore } from "./event-store";
import { createFakeClock } from "./fake-clock";

const URLS = ["wss://a/", "wss://b/", "wss://c/"] as RelayUrl[];

const setup = () => {
  const clock = createFakeClock();
  const connections = new Map<RelayUrl, FakeRelayConnection>();
  const pool = new ConnectionPool({
    scheduler: clock,
    connect: (url) => {
      const relay = new FakeRelayConnection(url);
      connections.set(url, relay);
      return relay;
    },
  });
  return { clock, connections, pool };
};

describe("collect", () => {
  it("イベントが届くたびにソフト期限を延長し、無応答になったら終了する", async () => {
    const { clock, connections, pool } = setup();
    const store = new EventStore();
    store.put = vi.fn(() => "inserted" as const);
    const settled: string[] = [];
    const completed = vi.fn();
    const promise = collect(
      pool,
      URLS,
      [{ kinds: [1] }],
      store,
      10_000,
      new Map<RelayUrl, PooledSubscription>(),
      {
        softTimeoutMs: 2_000,
        scheduler: clock,
        onRelaySettled: ({ url, reason }) => settled.push(`${url}:${reason}`),
      },
    ).then(completed);

    connections.get(URLS[0])?.emitEose(0);
    clock.advance(1_999);
    connections.get(URLS[1])?.emitEvent(0, {
      id: "a".repeat(64),
      pubkey: "b".repeat(64),
      created_at: 1,
      kind: 1,
      tags: [],
      content: "遅いリレーから届いたイベント",
      sig: "c".repeat(128),
    });
    clock.advance(1_999);
    await Promise.resolve();
    expect(completed).not.toHaveBeenCalled();

    clock.advance(1);
    await promise;

    expect(settled).toEqual([
      "wss://a/:eose",
      "wss://b/:timeout",
      "wss://c/:timeout",
    ]);
    expect(connections.get(URLS[2])?.subscriptions[0]?.closed).toBe(true);
  });

  it("最初の実応答が無ければソフト期限を開始せず、ハード期限まで待つ", async () => {
    const { clock, pool } = setup();
    const completed = vi.fn();
    const promise = collect(
      pool,
      URLS,
      [{ kinds: [1] }],
      new EventStore(),
      10_000,
      new Map<RelayUrl, PooledSubscription>(),
      { softTimeoutMs: 2_000, scheduler: clock },
    ).then(completed);

    clock.advance(9_999);
    await Promise.resolve();
    expect(completed).not.toHaveBeenCalled();

    clock.advance(1);
    await promise;
    expect(completed).toHaveBeenCalledOnce();
  });
});
