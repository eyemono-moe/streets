import { execFileSync } from "node:child_process";
import { expect, test } from "@playwright/test";
import { outboxNoteBText, outboxViewerPubkey } from "./fixtures/seed-outbox.js";

/**
 * `docker compose` を叩く。失敗したら「復帰しなかった」ではなく
 * 「操作そのものが失敗した」と分かる形で落とす — インフラの故障を
 * プロダクトのバグと取り違えないため (brief ambiguity 2)。
 */
const compose = (...args: string[]) => {
  try {
    execFileSync("docker", ["compose", ...args], { stdio: "pipe" });
  } catch (error) {
    throw new Error(
      `infrastructure error: \`docker compose ${args.join(" ")}\` failed: ${
        (error as Error).message
      }`,
    );
  }
};

test.describe("relay recovery", () => {
  // docker compose stop/start を挟むため、他の e2e より一桁遅い
  // (専用 spec に分けること — brief 注意書き)。
  test.afterAll(() => {
    // 途中で失敗しても、以降の全テスト実行のためにリレー2を止めたままにしない。
    compose("start", "nostr-rs-relay-2");
  });

  test("recovers a relay that went away and came back", async ({ page }) => {
    test.setTimeout(180_000);

    await page.goto(`/debug/v1-section?pubkey=${outboxViewerPubkey}`);
    await expect(page.getByTestId("items")).toContainText(outboxNoteBText, {
      timeout: 15_000,
    });

    compose("stop", "nostr-rs-relay-2");
    await expect(page.getByTestId("unreachable")).not.toHaveText(
      "unreachableRelays: 0",
      { timeout: 30_000 },
    );

    compose("start", "nostr-rs-relay-2");
    // 初回 1 秒からの指数バックオフ + ジッタ。上限 60 秒 (ADR-0021)。
    await expect(page.getByTestId("unreachable")).toHaveText(
      "unreachableRelays: 0",
      { timeout: 120_000 },
    );
    await expect(page.getByTestId("items")).toContainText(outboxNoteBText);
  });
});
