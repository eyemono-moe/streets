import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  retries: 0,
  reporter: "line",
  // 複数の spec ファイルが同じローカルリレー (8080/8081) を共有しており、
  // 読むだけでなく書く spec もある — relay-recovery.spec.ts は実行中に
  // リレー2 へ kind:1 を 1 通発行する。並列だと、それが v1-section.spec.ts
  // や connection-budget.spec.ts の主張の最中に届きうる。ファイル間の
  // 依存関係を毎回把握して spec を書くよりも、全体を 1 worker に固定して
  // 「異なるファイルの e2e は同時に走らない」という不変条件を機構で
  // 保証するほうが安全 (Task 13 fix round 1)。
  // このスイートは小さい (現状 10 テスト) ので、直列化の時間コストは許容範囲。
  //
  // なお当初この設定は relay-recovery.spec.ts の `docker compose stop/start`
  // を隔離するためのものだったが、その stop/start 自体を廃止した
  // (spec 冒頭のコメント参照)。共有リレーへの書き込みという理由の方は残る。
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
