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
      command: `vp dev --port ${APP_PORT} --strictPort`,
      cwd: "../apps/web",
      url: APP_URL,
      reuseExistingServer: !process.env.CI,
    },
  ],
});
