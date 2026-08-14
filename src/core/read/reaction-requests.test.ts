import { describe, expect, it } from "vitest";
import { createFakeClock } from "./fake-clock";
import { createReactionRequests } from "./reaction-requests";
import type { SubscriptionManager } from "./subscription-manager";

const TARGET = "a".repeat(64);
const OTHER = "b".repeat(64);

/** `fetchOnce` の呼び出しを記録するテストダブル。 */
const createFakeManager = () => {
  const calls: unknown[][] = [];
  return {
    calls,
    manager: {
      async fetchOnce(filters: unknown[]) {
        calls.push(filters);
      },
    } as unknown as SubscriptionManager,
  };
};

describe("createReactionRequests", () => {
  it("窓の間に溜めた対象 id を 1 本のフィルタにまとめる", () => {
    // 捕まえる変異: request のたびに fetchOnce を呼ぶ (40 件のノートで
    // 40 本の REQ が飛ぶ)
    const clock = createFakeClock();
    const { calls, manager } = createFakeManager();
    const requests = createReactionRequests({ manager, scheduler: clock });
    requests.request(TARGET);
    requests.request(OTHER);
    clock.advance(200);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual([{ kinds: [7], "#e": [TARGET, OTHER] }]);
  });

  it("同じ対象を 2 度要求しても 1 度しか投げない", () => {
    // 捕まえる変異: 要求済みを覚えない (窓が回るたびに全ノートを引き直し、
    // REQ が際限なく伸びる)
    const clock = createFakeClock();
    const { calls, manager } = createFakeManager();
    const requests = createReactionRequests({ manager, scheduler: clock });
    requests.request(TARGET);
    clock.advance(200);
    requests.request(TARGET);
    clock.advance(200);
    expect(calls).toHaveLength(1);
  });

  it("窓が閉じた後の要求は次のバッチになる", () => {
    // 捕まえる変異: flush で pending を差し替えない (次の要求が今回の
    // バッチへ混ざる or 取りこぼす)
    const clock = createFakeClock();
    const { calls, manager } = createFakeManager();
    const requests = createReactionRequests({ manager, scheduler: clock });
    requests.request(TARGET);
    clock.advance(200);
    requests.request(OTHER);
    clock.advance(200);
    expect(calls).toHaveLength(2);
    expect(calls[1]).toEqual([{ kinds: [7], "#e": [OTHER] }]);
  });

  it("バッチが片付いたらリスナーへ知らせる", async () => {
    // 捕まえる変異: 通知しない (一覧が届いても再描画されない)
    const clock = createFakeClock();
    const { manager } = createFakeManager();
    const requests = createReactionRequests({ manager, scheduler: clock });
    let notified = 0;
    requests.subscribe(() => {
      notified += 1;
    });
    requests.request(TARGET);
    clock.advance(200);
    await Promise.resolve();
    expect(notified).toBe(1);
  });

  it("dispose 後は要求もしないしタイマーも残らない", () => {
    // 捕まえる変異: dispose を無視する (アンマウント後に REQ が飛ぶ)
    const clock = createFakeClock();
    const { calls, manager } = createFakeManager();
    const requests = createReactionRequests({ manager, scheduler: clock });
    requests.request(TARGET);
    requests.dispose();
    clock.advance(200);
    expect(calls).toHaveLength(0);
    expect(clock.pendingCount).toBe(0);
  });

  it("lastBatchSize と maxBatchSize は複数バッチの状態を追随する", () => {
    const clock = createFakeClock();
    const { manager } = createFakeManager();
    const requests = createReactionRequests({ manager, scheduler: clock });
    expect(requests.lastBatchSize).toBe(0);
    expect(requests.maxBatchSize).toBe(0);

    requests.request(TARGET);
    requests.request(OTHER);
    clock.advance(200);
    expect(requests.lastBatchSize).toBe(2);
    expect(requests.maxBatchSize).toBe(2);

    // 2 回目のバッチが小さい場合、lastBatchSize は下がるが maxBatchSize は上がらない
    const NEW1 = "c".repeat(64);
    requests.request(NEW1);
    clock.advance(200);
    expect(requests.lastBatchSize).toBe(1);
    expect(requests.maxBatchSize).toBe(2);

    // 3 回目のバッチがより大きい場合、maxBatchSize が上がる
    const IDS = Array.from({ length: 5 }, (_, i) =>
      String(i + 100).padStart(64, "0"),
    );
    for (const id of IDS) {
      requests.request(id);
    }
    clock.advance(200);
    expect(requests.lastBatchSize).toBe(5);
    expect(requests.maxBatchSize).toBe(5);
  });
});
