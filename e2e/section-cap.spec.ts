import { expect, test } from "@playwright/test";
import { capViewerPubkey } from "./fixtures/seed-cap.js";

/**
 * ADR-0011 の「1 セクションが保持するイベント数 200 件」を E2E で測る。
 * この ADR は「測定できない予算は要件ではなく願望である」と定めており、
 * 7 指標のうち測定済みは 30 接続上限だけだった。これが 2 つ目になる。
 */
test("caps a section at 200 items", async ({ page }) => {
  test.setTimeout(60_000);

  await page.goto(`/debug/v1-section?pubkey=${capViewerPubkey}`);

  // phase が settled になってから読む。streaming の途中で読むと、
  // まだ 200 に達していないだけの数字を見てしまう。
  await expect(page.getByTestId("phase")).toHaveText("phase: settled", {
    timeout: 30_000,
  });
  await expect(page.getByTestId("count")).toHaveText("items: 200");
});
