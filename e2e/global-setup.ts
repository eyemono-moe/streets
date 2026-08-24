import { chromium } from "@playwright/test";
import { seedBudgetFixture } from "./fixtures/seed-budget.js";
import { seedCapFixture } from "./fixtures/seed-cap.js";
import { seedOutboxFixture } from "./fixtures/seed-outbox.js";
import { seedPreviewFixture } from "./fixtures/seed-preview.js";
import { seedThreadFixture } from "./fixtures/seed-thread.js";
import { seedLocalRelay } from "./fixtures/seed.js";

// playwright.config.ts の webServer.url と同じ値。globalSetup はモジュール
// 単体なので config を import してもよいが、config 側は webServer 起動の
// ためだけにこの文字列を持っており、循環を避けて直書きする方が単純。
const devServerUrl = "http://127.0.0.1:4173/";

/**
 * webServer の readiness チェック (HTTP 200 が返るか) が通っても、Vite の
 * 開発サーバは「ポートを bind した」だけで「モジュールを変換して返せる」
 * とは限らない。**2 種類のコールドスタートがある。**
 *
 * 1. **依存の事前バンドル** (esbuild によるスキャン)。サーバ起動後の最初の
 *    実リクエストで走り、アプリ全体の import グラフを辿り終えるまで
 *    数秒〜十数秒応答が止まる。これはルートに関係なく一度だけ。
 * 2. **ルートごとのモジュール変換**。Vite は要求されたモジュールだけを
 *    その場で変換するので、まだ誰も開いていないルートの初回アクセスは
 *    そのルート固有のグラフ (`/debug/v1-section` なら読み取り層の計装
 *    一式) を変換し終えるまで待たされる。**1 を払っても 2 は残る。**
 *
 * このコストをテスト本体の中で払うと、そのルートを最初に開く spec が
 * ナビゲーションの終わらないまま assertion のタイムアウトを迎える。
 * 実際 `/` だけを暖めていた時期に、スイート最初の
 * `connection-budget.spec.ts` (`/debug/v1-section`) が CI で 2 回連続
 * 落ちた —— 1 回目は `warmup` の中身が 0 件のまま、2 回目は要素が現れず、
 * 同じ URL を使う 2 番目・3 番目の spec はどちらも通っていた。
 *
 * したがって **spec が開くルートを 1 つずつ実際に開く**。クエリ文字列は
 * ルートのモジュールに影響しないので、代表値で足りる。
 */
const warmUpRoutes = ["/", "/v1", "/debug/v1-section"];

const warmUpDevServer = async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    for (const route of warmUpRoutes) {
      await page.goto(new URL(route, devServerUrl).href, {
        waitUntil: "load",
        timeout: 60_000,
      });
    }
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
  await seedThreadFixture();
  await warmUpDevServer();
}
