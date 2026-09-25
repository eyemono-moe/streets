import type { Page } from "@playwright/test";
import { DECK_EVENT_IDENTIFIER, deckStorageKey } from "@streets/core/deck/deck";
import {
  conversationKey,
  decryptNip44,
} from "@streets/core/signer/nip46/nip44";
import { column } from "../src/deck";
import { expect, test } from "../src/fixtures";
import { waitForEvent } from "../src/relay";

const settingsButton = { name: "カラムの設定", exact: true } as const;
const deleteButton = { name: "このカラムを削除", exact: true } as const;

/**
 * サイドバーからカラム追加パネルを開き、プリセットから「ブックマーク」を足す。
 * 足してもパネルは開いたままなので、同じ名前で見えるボタンが 2 つになる前に閉じる。
 */
const addBookmarksColumn = async (page: Page) => {
  const addColumnButton = { name: "カラムを追加", exact: true } as const;
  await page.getByRole("button", addColumnButton).click();
  await page
    .getByRole("heading", { name: "カラムを追加する" })
    .waitFor({ state: "visible" });
  await page.getByRole("button", { name: /^ブックマーク/ }).click();
  await page.getByRole("button", addColumnButton).click();
};

/** サイドバーのカラム一覧に出るボタン。追加パネルのプリセット行と名前が被るので、nav の中に絞る。 */
const railColumnButton = (page: Page, name: string | RegExp) =>
  page.getByRole("navigation").getByRole("button", { name });

test("カラムを追加できる", async ({ page, openApp, signIn }) => {
  await openApp();
  await signIn();

  await addBookmarksColumn(page);
  await expect(column(page, "ブックマーク").getByRole("heading")).toBeVisible();
  await expect(railColumnButton(page, /^ブックマーク/)).toBeVisible();

  await page.reload();
  await expect(column(page, "ブックマーク").getByRole("heading")).toBeVisible();
});

test("カラムを削除できる", async ({ page, openApp, signIn }) => {
  await openApp();
  await signIn();
  await addBookmarksColumn(page);
  await expect(column(page, "ブックマーク").getByRole("heading")).toBeVisible();

  await column(page, "ブックマーク")
    .getByRole("button", settingsButton)
    .click();
  await page.getByRole("button", deleteButton).click();
  await expect(column(page, "ブックマーク")).toBeHidden();
  await expect(railColumnButton(page, /^ブックマーク/)).toBeHidden();

  await page.reload();
  await expect(column(page, "ブックマーク")).toBeHidden();
});

test("カラムを編集できる", async ({ page, openApp, signIn }) => {
  await openApp();
  await signIn();

  const home = column(page, "ホーム");
  const before = await home.boundingBox();
  // 幅の既定は M（380）。S（320）へ変えたことが画面上の幅に出るかを見る。
  expect(before?.width).toBeGreaterThan(340);

  await home.getByRole("button", settingsButton).click();
  const widthS = page.getByRole("radio", { name: "S 320" });
  // ラジオの入力は見出しの文字の下に隠れている（SegmentedControl の見た目）ので、
  // 文字を押す。
  await page.getByText("S 320", { exact: true }).click();
  await expect(widthS).toBeChecked();

  await expect(async () => {
    const after = await home.boundingBox();
    expect(after?.width).toBeLessThan(340);
  }).toPass();

  await page.reload();
  await expect(async () => {
    const after = await column(page, "ホーム").boundingBox();
    expect(after?.width).toBeLessThan(340);
  }).toPass();
});

test("カラムの変更がアカウントに保存され、別の端末でも戻る", async ({
  page,
  me,
  openApp,
  signIn,
}) => {
  await openApp();
  await signIn();
  await addBookmarksColumn(page);
  await expect(column(page, "ブックマーク").getByRole("heading")).toBeVisible();

  // ログインした直後にも既定のデッキが書かれるので、足したカラムを含む版を待つ。
  const key = conversationKey(me.secretKey, me.pubkey);
  await waitForEvent(
    { kinds: [30078], authors: [me.pubkey], "#d": [DECK_EVENT_IDENTIFIER] },
    (event) => decryptNip44(event.content, key).includes('"bookmarks"'),
  );

  // 端末に覚えたデッキを消すと、アカウントに保存したものしか残らない。別の端末で開いたのと同じ。
  await page.evaluate(
    (storageKey) => localStorage.removeItem(storageKey),
    deckStorageKey(me.pubkey),
  );
  await page.reload();
  await expect(column(page, "ブックマーク").getByRole("heading")).toBeVisible();
});
