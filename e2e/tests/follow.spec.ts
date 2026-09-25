import type { Page } from "@playwright/test";
import { encodeBech32 } from "@streets/core/nostr/nip19";
import { column } from "../src/deck";
import { expect, test } from "../src/fixtures";
import { query, waitForEvent } from "../src/relay";
import { type User, createUser } from "../src/users";

/**
 * まだフォローしていない相手のカラムを開く。ホームはフォロー中の人しか出さない
 * ので、探すには検索を使う —— これが「フォローしていない相手を見に行く」ふつうの
 * 経路（`from:` は NIP-50 の絞り込みではなく通常の `authors` フィルタになるので、
 * 検索を NIP-50 に対応しないリレーへ送っても届く）。
 */
const openUserColumn = async (page: Page, target: User) => {
  const npub = encodeBech32("npub", target.pubkey);
  const searchButton = page.getByRole("button", { name: "検索パネルを開く" });
  // 同じボタンで開閉するので、開いているかを見てから押す。
  const setSearchPanel = async (open: boolean) => {
    const expanded = String(open);
    if ((await searchButton.getAttribute("aria-expanded")) !== expanded) {
      await searchButton.click();
    }
    await expect(searchButton).toHaveAttribute("aria-expanded", expanded);
  };
  await setSearchPanel(true);
  await page.getByRole("textbox", { name: "検索クエリ" }).fill(`from:${npub}`);
  await page.getByRole("button", { name: "この条件でカラムを開く" }).click();
  await setSearchPanel(false);

  await column(page, `from:${npub}`)
    .getByRole("article")
    .getByRole("button", { name: target.name, exact: true })
    .first()
    .click();
  return page.getByRole("dialog");
};

/** 自分の最新の kind:3 の `p` タグの並び。 */
const latestFollowees = async (me: User): Promise<string[]> => {
  const events = await query({ kinds: [3], authors: [me.pubkey] });
  const latest = events.reduce((newest, event) =>
    event.created_at > newest.created_at ? event : newest,
  );
  return latest.tags.filter((tag) => tag[0] === "p").map((tag) => tag[1]);
};

test("フォローできる", async ({ page, me, openApp, signIn }) => {
  const alice = await createUser("alice");
  await alice.post({ kind: 1, content: `フォローのテスト ${Date.now()}` });

  await openApp();
  await signIn();

  const dialog = await openUserColumn(page, alice);
  await dialog.getByRole("button", { name: "フォロー", exact: true }).click();
  await expect(
    dialog.getByRole("button", { name: "フォロー中", exact: true }),
  ).toBeVisible();

  await waitForEvent({ kinds: [3], authors: [me.pubkey] }, (event) =>
    event.tags.some((tag) => tag[0] === "p" && tag[1] === alice.pubkey),
  );
  expect(await latestFollowees(me)).toContain(alice.pubkey);
});

test("フォローを外せる", async ({ page, me, openApp, signIn }) => {
  const alice = await createUser("alice");
  await alice.post({ kind: 1, content: `フォロー解除のテスト ${Date.now()}` });
  // 既にフォロー済みから始める。アプリが書く分と created_at が同じ秒になると
  // 新旧が決まらないので、先に少し戻しておく。
  await me.post({
    kind: 3,
    tags: [["p", alice.pubkey]],
    created_at: Math.floor(Date.now() / 1000) - 10,
  });

  await openApp();
  await signIn();

  const dialog = await openUserColumn(page, alice);
  await expect(
    dialog.getByRole("button", { name: "フォロー中", exact: true }),
  ).toBeVisible();
  // フォロー解除は、フォロー中のボタンにホバー（またはフォーカス）すると出る。
  await dialog.getByRole("button", { name: "フォロー中", exact: true }).hover();
  await dialog
    .getByRole("button", { name: "フォロー解除", exact: true })
    .click();
  await expect(
    dialog.getByRole("button", { name: "フォロー", exact: true }),
  ).toBeVisible();

  await waitForEvent(
    { kinds: [3], authors: [me.pubkey] },
    (event) =>
      !event.tags.some((tag) => tag[0] === "p" && tag[1] === alice.pubkey),
  );
  expect(await latestFollowees(me)).not.toContain(alice.pubkey);
});

test("続けて2人をフォローしても、両方残る", async ({
  page,
  me,
  openApp,
  signIn,
}) => {
  const alice = await createUser("alice");
  const bob = await createUser("bob");
  await alice.post({ kind: 1, content: `A ${Date.now()}` });
  await bob.post({ kind: 1, content: `B ${Date.now()}` });

  await openApp();
  await signIn();

  const dialogA = await openUserColumn(page, alice);
  await dialogA.getByRole("button", { name: "フォロー", exact: true }).click();
  await expect(
    dialogA.getByRole("button", { name: "フォロー中", exact: true }),
  ).toBeVisible();
  // 閉じてから次の相手を探す —— 開いたままだと、次の `page.getByRole("dialog")`
  // が 2 つに当たってしまう。
  await dialogA.getByRole("button", { name: "戻る", exact: true }).click();
  await expect(dialogA).toBeHidden();

  const dialogB = await openUserColumn(page, bob);
  await dialogB.getByRole("button", { name: "フォロー", exact: true }).click();
  await expect(
    dialogB.getByRole("button", { name: "フォロー中", exact: true }),
  ).toBeVisible();

  const hasBoth = (followees: string[]) =>
    followees.includes(alice.pubkey) && followees.includes(bob.pubkey);
  await waitForEvent({ kinds: [3], authors: [me.pubkey] }, (event) =>
    hasBoth(event.tags.filter((tag) => tag[0] === "p").map((tag) => tag[1])),
  );
  expect(hasBoth(await latestFollowees(me))).toBe(true);
});

test("別の端末で足したフォローが、こちらのフォローで消えない", async ({
  page,
  me,
  openApp,
  signIn,
}) => {
  const zack = await createUser("zack");
  const xavi = await createUser("xavi");
  const yumi = await createUser("yumi");
  await yumi.post({ kind: 1, content: `Y ${Date.now()}` });

  // ログインする前からある、既存のフォロー。
  await me.post({
    kind: 3,
    tags: [["p", zack.pubkey]],
    created_at: Math.floor(Date.now() / 1000) - 20,
  });

  await openApp();
  await signIn();

  // 別の端末を模して、アプリを開いた後にアプリを通さず直接リレーへ新しい版を書く。
  // この後アプリがフォローしても、ここで足した分を巻き戻してはいけない。
  await me.post({
    kind: 3,
    tags: [
      ["p", zack.pubkey],
      ["p", xavi.pubkey],
    ],
    created_at: Math.floor(Date.now() / 1000) - 10,
  });

  const dialog = await openUserColumn(page, yumi);
  await dialog.getByRole("button", { name: "フォロー", exact: true }).click();
  await expect(
    dialog.getByRole("button", { name: "フォロー中", exact: true }),
  ).toBeVisible();

  await waitForEvent({ kinds: [3], authors: [me.pubkey] }, (event) =>
    event.tags.some((tag) => tag[0] === "p" && tag[1] === yumi.pubkey),
  );
  const followees = await latestFollowees(me);
  expect(followees).toContain(zack.pubkey);
  expect(followees).toContain(xavi.pubkey);
  expect(followees).toContain(yumi.pubkey);
});
