import type { Scheduler } from "./connection-pool";

export type FakeClock = Scheduler & { advance(ms: number): void };

/**
 * 注入用の偽タイマー。テストからのみ使う (`fake-relay-connection.ts` と同じ
 * 位置づけ)。`advance()` を呼ぶまで何も発火しない —— 実タイマーに依存すると
 * バッチの窓を待つためにテストが遅くなり、しかも不安定になる。
 */
export const createFakeClock = (): FakeClock => {
  let now = 0;
  let nextId = 1;
  const timers = new Map<number, { at: number; callback: () => void }>();
  return {
    setTimeout: (callback, delayMs) => {
      const id = nextId++;
      timers.set(id, { at: now + delayMs, callback });
      return id as unknown as ReturnType<typeof setTimeout>;
    },
    clearTimeout: (handle) => {
      timers.delete(handle as unknown as number);
    },
    advance(ms) {
      now += ms;
      const due = [...timers.entries()]
        .filter(([, t]) => t.at <= now)
        .sort((a, b) => a[1].at - b[1].at);
      for (const [id, t] of due) {
        if (!timers.has(id)) continue;
        timers.delete(id);
        t.callback();
      }
    },
  };
};
