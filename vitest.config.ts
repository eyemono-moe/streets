import { mergeConfig } from "vitest/config";
import viteConfig from "./vite.config";

export default mergeConfig(viteConfig, {
  test: {
    // e2e/fixtures/fixture-pubkeys.test.ts はブラウザや playwright を必要と
    // しない純粋なロジックのテストなので、通常の src テストと同じく
    // `pnpm exec vitest run` の対象に含める (フィクスチャの pubkey 衝突を
    // 機械的に検出するため、Task 4 fix round 1)。
    include: ["src/**/*.test.{ts,tsx}", "e2e/**/*.test.{ts,tsx}"],
  },
});
