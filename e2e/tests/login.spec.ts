import { column } from "../src/deck";
import { expect, test } from "../src/fixtures";
import { createUser } from "../src/users";

const accountButton = { name: "アカウント", exact: true } as const;
const welcome = { name: /Nostr のアカウントを持っている方/ } as const;

test("ログインできる", async ({ page, openApp, signIn }) => {
  await openApp();
  await signIn();
  await expect(page.getByRole("button", { name: "ホーム（1）" })).toBeVisible();
});

test("再読み込みしてもログインが続く", async ({ page, openApp, signIn }) => {
  await openApp();
  await signIn();
  await page.reload();
  await expect(page.getByRole("button", accountButton)).toBeVisible();
  await expect(page.getByRole("button", welcome)).toBeHidden();
});

test("ログアウトすると、再読み込みしてもログアウトしたまま", async ({
  page,
  openApp,
  signIn,
}) => {
  await openApp();
  await signIn();
  await page.getByRole("button", accountButton).click();
  await page.getByRole("menuitem", { name: "ログアウト" }).click();
  await expect(page.getByRole("button", welcome)).toBeVisible();

  await page.reload();
  await expect(page.getByRole("button", welcome)).toBeVisible();
  await expect(page.getByRole("button", accountButton)).toBeHidden();
});

test("別のアカウントで入り直すと、前のアカウントのカラムが残らない", async ({
  page,
  openApp,
  signIn,
}) => {
  await openApp();
  await signIn();
  // 前のアカウントでだけ、通知のカラムを消しておく。
  await column(page, "通知")
    .getByRole("button", { name: "カラムの設定" })
    .click();
  await page.getByRole("button", { name: "このカラムを削除" }).click();
  await expect(page.getByRole("button", { name: "通知（3）" })).toBeHidden();

  await page.getByRole("button", accountButton).click();
  await page.getByRole("menuitem", { name: "ログアウト" }).click();
  await signIn(await createUser("other"));
  await expect(page.getByRole("button", { name: "通知（3）" })).toBeVisible();
});

test("署名器が拒否すると、黙って失敗せずに知らせる", async ({
  page,
  openApp,
  signIn,
  signer,
  loginMethod,
}) => {
  test.skip(loginMethod !== "nip07", "nak の署名器には拒否させられない");
  await openApp();
  await signIn();
  signer.set("reject");

  await page.getByRole("button", { name: "投稿パネルを開く" }).click();
  await page.getByRole("textbox", { name: "ノートの本文" }).fill("届かない");
  await page.getByRole("button", { name: "投稿", exact: true }).click();
  await expect(page.getByText(/署名を拒否しました/)).toBeVisible();
  // 書きかけは消さずに残す。
  await expect(page.getByRole("textbox", { name: "ノートの本文" })).toHaveValue(
    "届かない",
  );
});

test("署名器が応答しないと、待っていることを知らせる", async ({
  page,
  openApp,
  signIn,
  signer,
  loginMethod,
}) => {
  test.skip(loginMethod !== "nip07", "nak の署名器には無応答をさせられない");
  await openApp();
  await signIn();
  signer.set("hang");

  await page.getByRole("button", { name: "投稿パネルを開く" }).click();
  await page.getByRole("textbox", { name: "ノートの本文" }).fill("待たされる");
  await page.getByRole("button", { name: "投稿", exact: true }).click();
  // 待っている間も画面は止めず、トーストで知らせる。
  await expect(
    page.getByRole("status").filter({ hasText: "投稿の署名を待っています" }),
  ).toBeVisible();
  await expect(
    page.getByRole("dialog", { name: /署名を待っています/ }),
  ).toHaveCount(0);
});

test("署名器が止まると、送れなかったことを知らせる", async ({
  page,
  openApp,
  signIn,
  signer,
  loginMethod,
}) => {
  test.skip(loginMethod === "nip07", "拡張機能は止められない");
  await openApp();
  await signIn();
  signer.stop();

  await page.getByRole("button", { name: "投稿パネルを開く" }).click();
  await page.getByRole("textbox", { name: "ノートの本文" }).fill("届かない");
  await page.getByRole("button", { name: "投稿", exact: true }).click();
  await expect(page.getByText(/送信に失敗しました/)).toBeVisible();
  await expect(page.getByRole("textbox", { name: "ノートの本文" })).toHaveValue(
    "届かない",
  );
});

test("再読み込みのとき署名器が応えなくても、自分の画面を出す", async ({
  page,
  openApp,
  signIn,
  signer,
  loginMethod,
}) => {
  test.skip(loginMethod === "nip07", "拡張機能は止められない");
  await openApp();
  await signIn();
  signer.stop();

  await page.reload();
  // 署名器の返事（最大 10 秒）を待たずに出す。
  await expect(page.getByRole("button", accountButton)).toBeVisible({
    timeout: 3_000,
  });
  await expect(page.getByRole("button", welcome)).toBeHidden();
  await expect(page.getByText("署名器と繋がっていません")).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByRole("button", accountButton)).toBeVisible();
});
