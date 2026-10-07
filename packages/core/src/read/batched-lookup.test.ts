import { describe, expect, it } from "vite-plus/test";
import { createBatchedLookup } from "./batched-lookup";
import { createFakeClock } from "./fake-clock";
import type { SubscriptionManager } from "./subscription-manager";

const createFakeManager = (options?: { fail?: boolean }) => {
  const calls: { filters: unknown[]; options: unknown }[] = [];
  const manager = {
    async fetchOnce(filters: unknown[], fetchOptions?: unknown) {
      calls.push({ filters, options: fetchOptions });
      if (options?.fail) throw new Error("fail");
    },
  } as unknown as SubscriptionManager;
  return { calls, manager };
};

const setup = (
  overrides: Partial<Parameters<typeof createBatchedLookup<string>>[0]> = {},
  managerOptions?: { fail?: boolean },
) => {
  const clock = createFakeClock();
  const { calls, manager } = createFakeManager(managerOptions);
  const lookup = createBatchedLookup<string>({
    manager,
    scheduler: clock,
    windowMs: 200,
    keyOf: (item) => item,
    plan: (items) => ({ filters: [{ ids: items }] }),
    ...overrides,
  });
  return { clock, calls, lookup };
};

const settle = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

describe("createBatchedLookup", () => {
  it("窓の間にためたものを 1 本の fetchOnce にまとめ、同じキーは 1 つにする", () => {
    // 捕まえる変異: enqueue のたびに fetchOnce を呼ぶ / 重複を排除しない
    const { clock, calls, lookup } = setup();
    lookup.enqueue("a");
    lookup.enqueue("b");
    lookup.enqueue("a");
    expect(calls).toHaveLength(0);
    clock.advance(200);
    expect(calls).toEqual([
      { filters: [{ ids: ["a", "b"] }], options: undefined },
    ]);
  });

  it("窓が閉じた後の要求は次の束になる", () => {
    // 捕まえる変異: flush で pending を差し替えない
    const { clock, calls, lookup } = setup();
    lookup.enqueue("a");
    clock.advance(200);
    lookup.enqueue("b");
    clock.advance(200);
    expect(calls.map((call) => call.filters)).toEqual([
      [{ ids: ["a"] }],
      [{ ids: ["b"] }],
    ]);
  });

  it("plan が返した relays を fetchOnce へ渡す", () => {
    const { clock, calls, lookup } = setup({
      plan: (items) => ({
        filters: [{ ids: items }],
        relays: ["wss://r.example"],
      }),
    });
    lookup.enqueue("a");
    clock.advance(200);
    expect(calls[0]?.options).toEqual({ relays: ["wss://r.example"] });
  });

  it("取り終えたら onFetched の後に listener を呼び、取っている間は inflight", async () => {
    // 捕まえる変異: 通知しない / inflight を外さない / onFetched より先に通知する
    const order: string[] = [];
    const { clock, lookup } = setup({
      onFetched: (items) => order.push(`fetched:${items.join()}`),
    });
    lookup.subscribe(() => order.push("notify"));
    lookup.enqueue("a");
    clock.advance(200);
    expect(lookup.isInflight("a")).toBe(true);
    await settle();
    expect(lookup.isInflight("a")).toBe(false);
    expect(order).toEqual(["fetched:a", "notify"]);
  });

  it("失敗したら onFailed を呼び、listener には知らせず、inflight を外す", async () => {
    // 捕まえる変異: 失敗でも通知する / inflight を外さず再要求できなくなる
    let failed: string[] = [];
    let notified = 0;
    const { clock, lookup } = setup(
      { onFailed: (items) => (failed = items) },
      { fail: true },
    );
    lookup.subscribe(() => (notified += 1));
    lookup.enqueue("a");
    clock.advance(200);
    await settle();
    expect(failed).toEqual(["a"]);
    expect(notified).toBe(0);
    expect(lookup.isInflight("a")).toBe(false);
  });

  it("immediate は窓を開かず、1 件ずつすぐ取りにいく", () => {
    // 捕まえる変異: immediate でもタイマーを張る / 束ねてしまう
    const { clock, calls, lookup } = setup({ windowMs: "immediate" });
    lookup.enqueue("a");
    lookup.enqueue("b");
    expect(clock.pendingCount).toBe(0);
    expect(calls.map((call) => call.filters)).toEqual([
      [{ ids: ["a"] }],
      [{ ids: ["b"] }],
    ]);
  });

  it("lastBatchSize と maxBatchSize は束の件数を追う", () => {
    const { clock, lookup } = setup();
    lookup.enqueue("a");
    lookup.enqueue("b");
    clock.advance(200);
    lookup.enqueue("c");
    clock.advance(200);
    expect(lookup.lastBatchSize).toBe(1);
    expect(lookup.maxBatchSize).toBe(2);
  });

  it("dispose 後は受け付けず、タイマーも通知も残らない", async () => {
    // 捕まえる変異: dispose を無視する / 飛行中の束が dispose 後に通知する
    const { clock, calls, lookup } = setup();
    lookup.enqueue("a");
    lookup.dispose();
    expect(clock.pendingCount).toBe(0);
    expect(lookup.enqueue("b")).toBe(false);
    clock.advance(200);
    expect(calls).toHaveLength(0);

    let notified = 0;
    const flying = setup();
    flying.lookup.subscribe(() => (notified += 1));
    flying.lookup.enqueue("a");
    flying.clock.advance(200);
    flying.lookup.dispose();
    await settle();
    expect(notified).toBe(0);
  });
});
