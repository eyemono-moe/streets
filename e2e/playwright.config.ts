import { defineConfig } from "@playwright/test";
import { APP_PORT, APP_URL } from "./src/env";
import type { LoginMethod } from "./src/fixtures";

const methods: LoginMethod[] = ["nip07", "bunker", "nostrconnect"];

export default defineConfig({
  testDir: "tests",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // nak のリレーを全員で使う。並べすぎると nak の署名器が落ちる（14 並列で実際に落ちた）。
  workers: 4,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: APP_URL,
    locale: "ja-JP",
    trace: "retain-on-failure",
  },
  projects: methods.map((loginMethod) => ({
    name: loginMethod,
    use: { browserName: "chromium", loginMethod },
  })),
  globalSetup: "./src/global-setup.ts",
  webServer: [
    {
      // 開発サーバーはテストごとにまっさらなブラウザへモジュールを 1 つずつ変換して配るので、
      // 開くたびに 1〜2 秒かかる。本番と同じ形にビルドして配る。
      command: `vp build --mode e2e --outDir dist-e2e && vp preview --mode e2e --outDir dist-e2e --port ${APP_PORT} --strictPort`,
      cwd: "../apps/web",
      url: APP_URL,
      reuseExistingServer: !process.env.CI,
    },
  ],
});
