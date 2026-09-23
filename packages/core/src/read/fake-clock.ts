import type { Scheduler } from "./connection-pool";

export type FakeClock = Scheduler & {
  advance(ms: number): void;
  /**
   * 今スケジュールされているタイマーの数。`dispose()` の消し忘れを直接の
   * 個数で確かめる診断値。
   */
  readonly pendingCount: number;
};

/**
 * 注入用の偽タイマー。`advance()` を呼ぶまで何も発火しない —— 実タイマー
 * だとバッチの窓を待つためテストが遅く不安定になる。
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
    now: () => now,
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
    get pendingCount() {
      return timers.size;
    },
  };
};
