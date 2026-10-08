import { describe, expect, it } from "vite-plus/test";
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
});
