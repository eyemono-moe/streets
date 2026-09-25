import { encodeBech32 } from "@streets/core/nostr/nip19";
import { column } from "../src/deck";
import { expect, test } from "../src/fixtures";
import { waitForEvent } from "../src/relay";
import { createUser } from "../src/users";

test("フォローしている人の投稿がホームに出る", async ({
  page,
  me,
  openApp,
  signIn,
}) => {
  const alice = await createUser("alice");
  const before = await alice.post({ kind: 1, content: `事前 ${Date.now()}` });
  // フォロー（kind:3）はアプリを開く前に届けておく —— 開いた後に届くと、
  // 購読がフォロー一覧を読み直すまで画面に出ない。
  await me.post({ kind: 3, tags: [["p", alice.pubkey]] });

  await openApp();
  await signIn();

  await expect(
    column(page, "ホーム")
      .getByRole("article")
      .filter({ hasText: before.content }),
  ).toBeVisible();

  // 開いた後に届く投稿も、そのままホームに流れる。
  const live = `ライブ ${Date.now()}`;
  await alice.post({ kind: 1, content: live });
  await expect(
    column(page, "ホーム").getByRole("article").filter({ hasText: live }),
  ).toBeVisible();
});

test("自分への返信が通知に出る", async ({ page, me, openApp, signIn }) => {
  const myNote = await me.post({
    kind: 1,
    content: `気づいてね ${Date.now()}`,
  });
  const alice = await createUser("alice");
  const replyText = `返信するよ ${Date.now()}`;
  // NIP-10 の root e タグと p タグを自分で組み立てて、別のクライアントからの
  // 返信を模す。
  await alice.post({
    kind: 1,
    content: replyText,
    tags: [
      ["e", myNote.id, "", "root"],
      ["p", me.pubkey],
    ],
  });

  await openApp();
  await signIn();

  await expect(
    column(page, "通知").getByRole("article").filter({ hasText: replyText }),
  ).toBeVisible();
});

test("自分へのリアクションが通知に出る", async ({
  page,
  me,
  openApp,
  signIn,
}) => {
  const myNote = await me.post({ kind: 1, content: `見てね ${Date.now()}` });
  const alice = await createUser("alice");
  await alice.post({
    kind: 7,
    content: "+",
    tags: [
      ["e", myNote.id],
      ["p", me.pubkey],
    ],
  });

  await openApp();
  await signIn();

  await expect(
    column(page, "通知")
      .getByRole("article")
      .filter({ hasText: "alice" })
      .filter({ hasText: "いいね" }),
  ).toBeVisible();
});

/** 今の画面には自分の投稿だけを見る入口が無いので、`from:` の検索で探す。 */
test("自分の投稿が画面に出る", async ({ page, me, openApp, signIn }) => {
  await openApp();
  await signIn();

  const text = `自分の投稿 ${Date.now()}`;
  await page.getByRole("button", { name: "投稿パネルを開く" }).click();
  await page.getByRole("textbox", { name: "ノートの本文" }).fill(text);
  await page.getByRole("button", { name: "投稿", exact: true }).click();
  await waitForEvent(
    { authors: [me.pubkey], kinds: [1] },
    (event) => event.content === text,
  );

  const npub = encodeBech32("npub", me.pubkey);
  await page.getByRole("button", { name: "検索パネルを開く" }).click();
  await page.getByRole("textbox", { name: "検索クエリ" }).fill(`from:${npub}`);
  await page.getByRole("button", { name: "この条件でカラムを開く" }).click();

  await expect(
    column(page, `from:${npub}`).getByRole("article").filter({ hasText: text }),
  ).toBeVisible();
});
