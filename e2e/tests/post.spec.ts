import { expect, test } from "../src/fixtures";
import { waitForEvent } from "../src/relay";

test("テキストを投稿できる", async ({ page, me, openApp, signIn }) => {
  await openApp();
  await signIn();

  const text = `はじめての投稿 ${Date.now()}`;
  await page.getByRole("button", { name: "投稿パネルを開く" }).click();
  await page.getByRole("textbox", { name: "ノートの本文" }).fill(text);
  await page.getByRole("button", { name: "投稿", exact: true }).click();

  const note = await waitForEvent(
    { authors: [me.pubkey], kinds: [1] },
    (event) => event.content === text,
  );
  expect(note.tags).toEqual([]);
});
