import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  retries: 0,
  reporter: "line",
  // 複数の spec ファイルが同じローカルリレー (8080/8081) を共有している。
  // 既定の並列 worker だと、あるファイルの `docker compose stop
  // nostr-rs-relay-2`（relay-recovery.spec.ts）が、別ファイルの
  // リレー2 依存の主張（v1-section.spec.ts の outbox ルーティング、
  // connection-budget.spec.ts の budgetNoteTwoText/uncovered）と同時に
  // 走りうる。ファイル間の依存関係を毎回把握して spec を書くよりも、
  // 全体を 1 worker に固定して「異なるファイルの e2e は同時に走らない」
  // という不変条件を機構で保証するほうが安全 (Task 13 fix round 1)。
  // このスイートは小さい (現状 12 テスト) ので、直列化の時間コストは許容範囲。
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:4173",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "pnpm dev --host 127.0.0.1 --port 4173",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
