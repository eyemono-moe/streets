import { column } from "../src/deck";
import { expect, test } from "../src/fixtures";
import { waitForEvent } from "../src/relay";
import { type User, createUser } from "../src/users";

/**
 * 相手の投稿をホームに出す。フォロー（kind:3）はアプリを開く前に届けておく
 * —— 開いた後に届くと、購読がフォロー一覧を読み直すまで画面に出ない。
 */
const setUpAliceNote = async (me: User, content: string) => {
  const alice = await createUser("alice");
  const note = await alice.post({ kind: 1, content });
  await me.post({ kind: 3, tags: [["p", alice.pubkey]] });
  return { alice, note };
};

test("リアクションできる", async ({ page, me, openApp, signIn }) => {
  const text = `リアクションのテスト ${Date.now()}`;
  const { alice, note } = await setUpAliceNote(me, text);

  await openApp();
  await signIn();

  const article = column(page, "ホーム")
    .getByRole("article")
    .filter({ hasText: text });
  await article.getByRole("button", { name: "いいね", exact: true }).click();
  await expect(
    article.getByRole("button", { name: "いいね（済み）", exact: true }),
  ).toBeVisible();

  const reaction = await waitForEvent(
    { kinds: [7], authors: [me.pubkey] },
    (event) => event.tags.some((tag) => tag[0] === "e" && tag[1] === note.id),
  );
  expect(reaction.content).toBe("+");
  const eTag = reaction.tags.find((tag) => tag[0] === "e");
  expect(eTag?.[1]).toBe(note.id);
  expect(eTag?.[3]).toBe(alice.pubkey);
  expect(
    reaction.tags.some((tag) => tag[0] === "p" && tag[1] === alice.pubkey),
  ).toBe(true);
});

test("リポストできる", async ({ page, me, openApp, signIn }) => {
  const text = `リポストのテスト ${Date.now()}`;
  const { alice, note } = await setUpAliceNote(me, text);

  await openApp();
  await signIn();

  const article = column(page, "ホーム")
    .getByRole("article")
    .filter({ hasText: text });
  await article.getByRole("button", { name: "リポスト", exact: true }).click();
  await page.getByRole("menuitem", { name: "リポスト", exact: true }).click();
  // 自分のリポストもホームに流れるので、同じ本文の行が元の投稿とリポストの 2 つになる。
  await expect(
    article.getByRole("button", { name: "リポスト済み", exact: true }).first(),
  ).toBeVisible();

  const repost = await waitForEvent(
    { kinds: [6], authors: [me.pubkey] },
    (event) => event.tags.some((tag) => tag[0] === "e" && tag[1] === note.id),
  );
  const eTag = repost.tags.find((tag) => tag[0] === "e");
  expect(eTag?.[1]).toBe(note.id);
  expect(eTag?.[4]).toBe(alice.pubkey);
  expect(
    repost.tags.some((tag) => tag[0] === "p" && tag[1] === alice.pubkey),
  ).toBe(true);
  expect(JSON.parse(repost.content).id).toBe(note.id);
});

test("返信できる", async ({ page, me, openApp, signIn }) => {
  const text = `返信のテスト ${Date.now()}`;
  const { alice, note } = await setUpAliceNote(me, text);

  await openApp();
  await signIn();

  const article = column(page, "ホーム")
    .getByRole("article")
    .filter({ hasText: text });
  await article.getByRole("button", { name: "返信", exact: true }).click();

  const dialog = page.getByRole("dialog", { name: "返信する" });
  const replyText = `返信します ${Date.now()}`;
  await dialog.getByRole("textbox", { name: "返信の本文" }).fill(replyText);
  await dialog.getByRole("button", { name: "返信", exact: true }).click();
  await expect(dialog).toBeHidden();

  const reply = await waitForEvent(
    { kinds: [1], authors: [me.pubkey] },
    (event) => event.content === replyText,
  );
  const eTag = reply.tags.find((tag) => tag[0] === "e");
  expect(eTag?.[1]).toBe(note.id);
  expect(eTag?.[3]).toBe("root");
  expect(eTag?.[4]).toBe(alice.pubkey);
  expect(
    reply.tags.some((tag) => tag[0] === "p" && tag[1] === alice.pubkey),
  ).toBe(true);
});

test("引用できる", async ({ page, me, openApp, signIn }) => {
  const text = `引用のテスト ${Date.now()}`;
  const { alice, note } = await setUpAliceNote(me, text);

  await openApp();
  await signIn();

  const article = column(page, "ホーム")
    .getByRole("article")
    .filter({ hasText: text });
  await article.getByRole("button", { name: "リポスト", exact: true }).click();
  await page.getByRole("menuitem", { name: "引用", exact: true }).click();

  const dialog = page.getByRole("dialog", { name: "引用する" });
  const comment = `引用します ${Date.now()}`;
  await dialog.getByRole("textbox", { name: "引用の本文" }).fill(comment);
  await dialog.getByRole("button", { name: "引用", exact: true }).click();
  await expect(dialog).toBeHidden();

  const quote = await waitForEvent(
    { kinds: [1], authors: [me.pubkey] },
    (event) => event.tags.some((tag) => tag[0] === "q" && tag[1] === note.id),
  );
  expect(quote.content).toContain(comment);
  expect(quote.content).toContain("nostr:note1");
  expect(
    quote.tags.some((tag) => tag[0] === "p" && tag[1] === alice.pubkey),
  ).toBe(true);
});
