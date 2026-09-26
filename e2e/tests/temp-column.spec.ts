import { encodeBech32 } from "@streets/core/nostr/nip19";
import { expect, test } from "../src/fixtures";
import { createUser } from "../src/users";

test("狭い画面で URL から開いたユーザーを、カラムに残せる", async ({
  page,
  openApp,
  signIn,
}) => {
  const friend = await createUser("friend");
  await openApp();
  await signIn();
  // ログインは広い画面で済ませる（ようこそ画面のボタンは、狭い画面では横に送った先にある）。
  await page.setViewportSize({ width: 390, height: 800 });

  await page.goto(`/${encodeBech32("npub", friend.pubkey)}`);
  // 狭い画面では、上のバーが今のカラムの見出しを兼ねる。カラムの中に見出しを重ねて出さない。
  const top = page.getByRole("banner");
  const keep = page.getByRole("button", { name: "カラムに残す" });
  await expect(top.getByRole("button", { name: "カラムに残す" })).toBeVisible();
  await expect(keep).toHaveCount(1);
  const title = await top.getByRole("heading", { level: 1 }).textContent();
  await expect(
    page.getByRole("heading", { level: 2, name: title ?? "" }),
  ).toHaveCount(0);

  await keep.click();
  await expect(keep).toBeHidden();
  await expect(
    top.getByRole("button", { name: "カラムの設定", exact: true }),
  ).toBeVisible();
});
