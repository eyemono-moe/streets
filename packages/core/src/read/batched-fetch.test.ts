import { describe, expect, it } from "vite-plus/test";
import { createBatchedFetch } from "./batched-fetch";
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
  overrides: Partial<Parameters<typeof createBatchedFetch<string>>[0]> = {},
  managerOptions?: { fail?: boolean },
) => {
  const clock = createFakeClock();
  const { calls, manager } = createFakeManager(managerOptions);
  const batch = createBatchedFetch<string>({
    manager,
    scheduler: clock,
    batchWindowMs: 200,
    keyOf: (item) => item,
    toRequest: (items) => ({ filters: [{ ids: items }] }),
    ...overrides,
  });
  return { clock, calls, batch };
};

const settle = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

describe("createBatchedFetch", () => {
  it("窓の間にためたものを 1 本の fetchOnce にまとめ、同じキーは 1 つにする", () => {
    // 捕まえる変異: enqueue のたびに fetchOnce を呼ぶ / 重複を排除しない
    const { clock, calls, batch } = setup();
    batch.enqueue("a");
    batch.enqueue("b");
    batch.enqueue("a");
    expect(calls).toHaveLength(0);
    clock.advance(200);
    expect(calls).toEqual([
      { filters: [{ ids: ["a", "b"] }], options: undefined },
    ]);
  });

  it("窓が閉じた後の要求は次の束になる", () => {
    // 捕まえる変異: flush で pending を差し替えない
    const { clock, calls, batch } = setup();
    batch.enqueue("a");
    clock.advance(200);
    batch.enqueue("b");
    clock.advance(200);
    expect(calls.map((call) => call.filters)).toEqual([
      [{ ids: ["a"] }],
      [{ ids: ["b"] }],
    ]);
  });

  it("plan が返した relays を fetchOnce へ渡す", () => {
    const { clock, calls, batch } = setup({
      toRequest: (items) => ({
        filters: [{ ids: items }],
        relays: ["wss://r.example"],
      }),
    });
    batch.enqueue("a");
    clock.advance(200);
    expect(calls[0]?.options).toEqual({ relays: ["wss://r.example"] });
  });

  it("取り終えたら markFetched の後に listener を呼び、取っている間は inflight", async () => {
    // 捕まえる変異: 通知しない / inflight を外さない / markFetched より先に通知する
    const order: string[] = [];
    const { clock, batch } = setup({
      markFetched: (items) => order.push(`fetched:${items.join()}`),
    });
    batch.subscribe(() => order.push("notify"));
    batch.enqueue("a");
    clock.advance(200);
    expect(batch.isInflight("a")).toBe(true);
    await settle();
    expect(batch.isInflight("a")).toBe(false);
    expect(order).toEqual(["fetched:a", "notify"]);
  });

  it("失敗したら onFailed を呼び、listener には知らせず、inflight を外す", async () => {
    // 捕まえる変異: 失敗でも通知する / inflight を外さず再要求できなくなる
    let failed: string[] = [];
    let notified = 0;
    const { clock, batch } = setup(
      { onFailed: (items) => (failed = items) },
      { fail: true },
    );
    batch.subscribe(() => (notified += 1));
    batch.enqueue("a");
    clock.advance(200);
    await settle();
    expect(failed).toEqual(["a"]);
    expect(notified).toBe(0);
    expect(batch.isInflight("a")).toBe(false);
  });

  it("immediate は窓を開かず、1 件ずつすぐ取りにいく", () => {
    // 捕まえる変異: immediate でもタイマーを張る / 束ねてしまう
    const { clock, calls, batch } = setup({ batchWindowMs: "immediate" });
    batch.enqueue("a");
    batch.enqueue("b");
    expect(clock.pendingCount).toBe(0);
    expect(calls.map((call) => call.filters)).toEqual([
      [{ ids: ["a"] }],
      [{ ids: ["b"] }],
    ]);
  });

  it("lastBatchSize と maxBatchSize は束の件数を追う", () => {
    const { clock, batch } = setup();
    batch.enqueue("a");
    batch.enqueue("b");
    clock.advance(200);
    batch.enqueue("c");
    clock.advance(200);
    expect(batch.lastBatchSize).toBe(1);
    expect(batch.maxBatchSize).toBe(2);
  });

  it("dispose 後は受け付けず、タイマーも通知も残らない", async () => {
    // 捕まえる変異: dispose を無視する / 飛行中の束が dispose 後に通知する
    const { clock, calls, batch } = setup();
    batch.enqueue("a");
    batch.dispose();
    expect(clock.pendingCount).toBe(0);
    expect(batch.enqueue("b")).toBe(false);
    clock.advance(200);
    expect(calls).toHaveLength(0);

    let notified = 0;
    const flying = setup();
    flying.batch.subscribe(() => (notified += 1));
    flying.batch.enqueue("a");
    flying.clock.advance(200);
    flying.batch.dispose();
    await settle();
    expect(notified).toBe(0);
  });
});
