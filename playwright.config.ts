import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  // e2e/fixtures には Vitest 用の *.test.ts もある。Playwright の既定値では
  // それも対象になるため、ブラウザテストの命名規則だけを明示する。
  testMatch: /.*\.spec\.ts$/,
  globalSetup: "./e2e/global-setup.ts",
  retries: 0,
  reporter: "line",
  // 全 spec が同じローカルリレーを共有し、一部はイベントを書き込む。
  // ファイルを並列実行すると他の spec の観測結果へ混入するため直列にする。
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:4173",
    trace: "retain-on-failure",
  },
  webServer: {
    // 開発サーバーの初回モジュール変換と依存最適化は、テスト開始後にも
    // ページを再読み込みしうる。E2E は完成した本番ビルドだけを配信する。
    command:
      "pnpm build && pnpm preview --host 127.0.0.1 --port 4173 --strictPort",
    url: "http://127.0.0.1:4173",
    // ローカルの開発サーバーを誤って再利用すると CI と条件がずれる。
    reuseExistingServer: false,
    timeout: 120_000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
