import { realpathSync } from "node:fs";
import { mergeConfig } from "vitest/config";
import viteConfig from "./vite.config";

export default mergeConfig(viteConfig, {
  // Stryker の sandbox は node_modules をリポジトリ本体へ symlink する。
  // Vite 6 は realpath が root 外だと依存を拒否するため、実体も許可する。
  server: {
    fs: { allow: [process.cwd(), realpathSync("node_modules")] },
  },
  test: {
    // e2e/fixtures/fixture-pubkeys.test.ts はブラウザや playwright を必要と
    // しない純粋なロジックのテストなので、通常の src テストと同じく
    // `pnpm exec vitest run` の対象に含める (フィクスチャの pubkey 衝突を
    // 機械的に検出するため、Task 4 fix round 1)。
    include: ["src/**/*.test.{ts,tsx}", "e2e/**/*.test.{ts,tsx}"],
    // vite-plugin-solid の自動注入に任せると、リポジトリ内 worktree では
    // 外側 checkout の jest-dom を解決し、上の fs.allow に拒否される。
    setupFiles: [
      "./vitest.setup.ts",
      realpathSync("node_modules/@testing-library/jest-dom/dist/vitest.mjs"),
    ],
  },
});
