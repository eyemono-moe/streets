import { chromium } from "@playwright/test";
import { seedBudgetFixture } from "./fixtures/seed-budget.js";
import { seedCapFixture } from "./fixtures/seed-cap.js";
import { seedOutboxFixture } from "./fixtures/seed-outbox.js";
import { seedPreviewFixture } from "./fixtures/seed-preview.js";
import { seedLocalRelay } from "./fixtures/seed.js";

// playwright.config.ts の webServer.url と同じ値。globalSetup はモジュール
// 単体なので config を import してもよいが、config 側は webServer 起動の
// ためだけにこの文字列を持っており、循環を避けて直書きする方が単純。
const devServerUrl = "http://127.0.0.1:4173/";

/**
 * webServer の readiness チェック (HTTP 200 が返るか) が通っても、Vite の
 * 開発サーバは「ポートを bind した」だけで「モジュールを変換して返せる」
 * とは限らない。依存関係の事前バンドル (esbuild によるスキャン) は
 * サーバ起動後の最初の実リクエストで走り、アプリ全体の import グラフを
 * 辿ってバンドルし終えるまで数秒〜十数秒応答が止まる。
 *
 * この一回限りのコストをテスト本体の中で払うと、スイート最初の spec の
 * 最初の page.goto がそのままコールドスタートを被ってしまい、
 * ナビゲーションが終わらないまま assertion のタイムアウトを迎える
 * (e2e/connection-budget.spec.ts で観測)。事前バンドルはリクエストされた
 * ルートに関係なくアプリ全体の依存グラフに対して一度だけ走るので、
 * globalSetup の中で一度どこか (トップページ) を実際にブラウザで開いて
 * おけば、以降のナビゲーションはこのコストを払わずに済む。
 */
const warmUpDevServer = async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto(devServerUrl, { waitUntil: "load", timeout: 60_000 });
  } finally {
    await browser.close();
  }
};

export default async function globalSetup() {
  await seedLocalRelay();
  await seedOutboxFixture();
  await seedBudgetFixture();
  await seedCapFixture();
  await seedPreviewFixture();
  await warmUpDevServer();
}
