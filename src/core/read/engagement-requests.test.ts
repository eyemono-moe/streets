import { describe, expect, it } from "vitest";
import { createEngagementRequests } from "./engagement-requests";
import { createFakeClock } from "./fake-clock";
import type { SubscriptionManager } from "./subscription-manager";

const TARGET = "a".repeat(64);
const OTHER = "b".repeat(64);

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

describe("createEngagementRequests", () => {
  it("窓の間に溜めた対象 id を 1 本のフィルタにまとめる", () => {
    // 捕まえる変異: request のたびに fetchOnce を呼ぶ (40 件で 40 本の REQ が飛ぶ)
    const clock = createFakeClock();
    const { calls, manager } = createFakeManager();
    const requests = createEngagementRequests({ manager, scheduler: clock });
    requests.request(TARGET);
    requests.request(OTHER);
    clock.advance(200);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual([{ kinds: [1, 6, 7], "#e": [TARGET, OTHER] }]);
  });

  it("同じ対象を 2 度要求しても 1 度しか投げない", () => {
    // 捕まえる変異: 要求済みを覚えない (窓が回るたびに全ノートを引き直し REQ が伸び続ける)
    const clock = createFakeClock();
    const { calls, manager } = createFakeManager();
    const requests = createEngagementRequests({ manager, scheduler: clock });
    requests.request(TARGET);
    clock.advance(200);
    requests.request(TARGET);
    clock.advance(200);
    expect(calls).toHaveLength(1);
  });

  it("窓が閉じた後の要求は次のバッチになる", () => {
    // 捕まえる変異: flush で pending を差し替えない (次の要求が混ざる/取りこぼす)
    const clock = createFakeClock();
    const { calls, manager } = createFakeManager();
    const requests = createEngagementRequests({ manager, scheduler: clock });
    requests.request(TARGET);
    clock.advance(200);
    requests.request(OTHER);
    clock.advance(200);
    expect(calls).toHaveLength(2);
    expect(calls[1]).toEqual([{ kinds: [1, 6, 7], "#e": [OTHER] }]);
  });

  it("バッチが片付いたらリスナーへ知らせる", async () => {
    // 捕まえる変異: 通知しない (一覧が届いても再描画されない)
    const clock = createFakeClock();
    const { manager } = createFakeManager();
    const requests = createEngagementRequests({ manager, scheduler: clock });
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
    const requests = createEngagementRequests({ manager, scheduler: clock });
    requests.request(TARGET);
    requests.dispose();
    // advance 後だと発火済みで区別できないため、dispose 直後に見る。
    expect(clock.pendingCount).toBe(0);
    clock.advance(200);
    expect(calls).toHaveLength(0);
  });

  it("lastBatchSize と maxBatchSize は複数バッチの状態を追随する", () => {
    const clock = createFakeClock();
    const { manager } = createFakeManager();
    const requests = createEngagementRequests({ manager, scheduler: clock });
    expect(requests.lastBatchSize).toBe(0);
    expect(requests.maxBatchSize).toBe(0);

    requests.request(TARGET);
    requests.request(OTHER);
    clock.advance(200);
    expect(requests.lastBatchSize).toBe(2);
    expect(requests.maxBatchSize).toBe(2);

    const NEW1 = "c".repeat(64);
    requests.request(NEW1);
    clock.advance(200);
    expect(requests.lastBatchSize).toBe(1);
    expect(requests.maxBatchSize).toBe(2);

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
