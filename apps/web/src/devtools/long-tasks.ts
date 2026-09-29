export type LongTaskStats = { count: number; totalMs: number; maxMs: number };

// パネルを開く前の起動中も数えたいので、読み込んだ時点で observer を張る。
// buffered で、このファイルが読まれる前に起きた分も受け取る。
const stats: LongTaskStats = { count: 0, totalMs: 0, maxMs: 0 };

if (PerformanceObserver.supportedEntryTypes.includes("longtask")) {
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      stats.count += 1;
      stats.totalMs += entry.duration;
      stats.maxMs = Math.max(stats.maxMs, entry.duration);
    }
  }).observe({ type: "longtask", buffered: true });
}

export const longTaskStats = (): LongTaskStats => ({ ...stats });
