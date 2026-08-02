import { type Page, expect, test } from "@playwright/test";
import {
  budgetNoteOneText,
  budgetNoteTwoText,
  budgetViewerPubkey,
} from "./fixtures/seed-budget.js";

const debugUrl = `/debug/v1-section?budget=4&pubkey=${budgetViewerPubkey}`;

const numberIn = async (page: Page, testId: string) =>
  Number((await page.getByTestId(testId).textContent())?.replace(/\D/g, ""));

test("never opens more connections than the budget allows", async ({
  page,
}) => {
  await page.goto(debugUrl);
  await expect(page.getByTestId("warmup")).toContainText("followees: 9", {
    timeout: 15_000,
  });
  await expect(page.getByTestId("phase")).toHaveText("phase: settled", {
    timeout: 30_000,
  });

  // "connections" (今の接続数) は settled の時点で読むと、到達不能な架空
  // リレーの接続失敗がとっくに終わって枠を返した後になっている — 予算を
  // 一瞬でも超えて開いた事実はそこでは既に消えている (Task 12 fix round 1)。
  // ADR-0011 が予算しているのは「同時に何本まで開いたか」なので、
  // ConnectionPool の高水位マークである "peak-connections" を見る。
  expect(await numberIn(page, "peak-connections")).toBeLessThanOrEqual(4);
});

test("spends the budget on the relays that cover the most authors", async ({
  page,
}) => {
  await page.goto(debugUrl);

  // 架空リレーは 1 人ずつしかカバーしない。貪欲が効いていれば
  // 実在の 2 本が選ばれ、両方の投稿が出る
  await expect(page.getByTestId("items")).toContainText(budgetNoteOneText, {
    timeout: 15_000,
  });
  await expect(page.getByTestId("items")).toContainText(budgetNoteTwoText);
});

test("reports the authors it dropped instead of hiding them", async ({
  page,
}) => {
  await page.goto(debugUrl);
  await expect(page.getByTestId("phase")).toHaveText("phase: settled", {
    timeout: 30_000,
  });

  // 予算 4 に対し候補が 6 本あるので、架空リレー 2 本ぶんの著者が必ず落ちる。
  // 黙って欠落させてはならない (ADR-0011)
  expect(await numberIn(page, "uncovered")).toBe(2);
});
