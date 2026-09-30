import type { Page } from "@playwright/test";
import { encodeBech32 } from "@streets/core/nostr/nip19";
import {
  conversationKey,
  decryptNip44,
} from "@streets/core/signer/nip46/nip44";
import { column } from "../src/deck";
import { expect, test } from "../src/fixtures";
import { waitForEvent } from "../src/relay";
import type { User } from "../src/users";
import { createUser } from "../src/users";

/** サイドバーからカラム追加パネルを開き、「リスト」を選ぶ画面へ進む。 */
const openListPicker = async (page: Page) => {
  await page.getByRole("button", { name: "カラムを追加", exact: true }).click();
  await page
    .getByRole("heading", { name: /にカラムを追加$/ })
    .waitFor({ state: "visible" });
  await page.getByRole("button", { name: /^リスト/ }).click();
  await expect(
    page.getByRole("heading", { name: "リストを選ぶ" }),
  ).toBeVisible();
};

/** 相手の投稿を検索のカラムに出す。まだフォローしていない人を見に行くふつうの経路。 */
const openPostsOf = async (page: Page, target: User) => {
  const npub = encodeBech32("npub", target.pubkey);
  await page.getByRole("button", { name: "検索パネルを開く" }).click();
  await page.getByRole("textbox", { name: "検索クエリ" }).fill(`from:${npub}`);
  await page.getByRole("button", { name: "この条件でカラムを開く" }).click();
  await page.getByRole("button", { name: "検索パネルを開く" }).click();
  return column(page, `from:${npub}`);
};

test("リストを作り、投稿のメニューから人を入れて、その人の投稿を見られる", async ({
  page,
  me,
  openApp,
  signIn,
}) => {
  const alice = await createUser("alice");
  const content = `リストのテスト ${Date.now()}`;
  await alice.post({ kind: 1, content });

  await openApp();
  await signIn();

  // 作ったリストは、そのままデッキのカラムに足される。
  await openListPicker(page);
  await page.getByRole("button", { name: "リストを作る" }).click();
  const form = page.getByRole("dialog", { name: "リストを作る" });
  await form.getByRole("textbox", { name: "名前（必須）" }).fill("友だち");
  await form.getByRole("button", { name: "リストを作る" }).click();
  const created = await waitForEvent(
    { kinds: [30000], authors: [me.pubkey] },
    (event) =>
      event.tags.some((tag) => tag[0] === "title" && tag[1] === "友だち"),
  );
  const identifier = created.tags.find((tag) => tag[0] === "d")?.[1];
  expect(identifier).toBeTruthy();
  const list = column(page, "友だち");
  await expect(list.getByRole("heading")).toBeVisible();
  await page.getByRole("button", { name: "カラムを追加", exact: true }).click();

  const posts = await openPostsOf(page, alice);
  await posts
    .getByRole("article")
    .filter({ hasText: content })
    .getByRole("button", { name: "この投稿の操作" })
    .click();
  await page.getByRole("menuitem", { name: "リストに追加" }).click();
  const dialog = page.getByRole("dialog", { name: "リストに追加" });
  await dialog
    .getByRole("listitem")
    .filter({ hasText: "友だち" })
    .getByText("非公開", { exact: true })
    .click();
  const key = conversationKey(me.secretKey, me.pubkey);
  const added = await waitForEvent(
    { kinds: [30000], authors: [me.pubkey], "#d": [identifier ?? ""] },
    (event) =>
      event.content !== "" &&
      decryptNip44(event.content, key).includes(alice.pubkey),
  );
  // 非公開で入れた人は、公開のタグには出ない。
  expect(added.tags.some((tag) => tag[0] === "p")).toBe(false);
  await dialog.getByRole("button", { name: "閉じる" }).click();

  await expect(
    list.getByRole("article").filter({ hasText: content }),
  ).toBeVisible();

  // メンバーは見出しの ⓘ から開くリストの情報に出る。
  await list.getByRole("button", { name: "リストの情報" }).click();
  const info = page.getByRole("dialog");
  await expect(
    info.getByRole("heading", { name: "友だち", exact: true }),
  ).toBeVisible();
  await expect(
    info.getByText("入っている人（1 人・非公開 1 人）"),
  ).toBeVisible();
});
