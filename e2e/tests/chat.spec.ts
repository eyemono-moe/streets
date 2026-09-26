import { encodeNevent } from "@streets/core/nostr/nip19";
import { RELAY_URL } from "../src/env";
import { expect, test } from "../src/fixtures";
import { waitForEvent } from "../src/relay";
import { createUser } from "../src/users";

test("チャンネルで返信を書ける", async ({ page, me, openApp, signIn }) => {
  const owner = await createUser("owner");
  const channel = await owner.post({
    kind: 40,
    content: JSON.stringify({ name: "テストの部屋", relays: [RELAY_URL] }),
  });
  const hello = await owner.post({
    kind: 42,
    content: `いらっしゃい ${Date.now()}`,
    tags: [["e", channel.id, RELAY_URL, "root"]],
  });

  await openApp();
  await signIn();
  const nevent = encodeNevent({
    id: channel.id,
    relays: [RELAY_URL],
    eventKind: 40,
  });
  await page.goto(`/${nevent}?relays=${encodeURIComponent(RELAY_URL)}`);

  const message = page.getByRole("article").filter({ hasText: hello.content });
  await expect(message).toBeVisible();
  await message.hover();
  await message.getByRole("button", { name: "返信する" }).click();

  const text = `こんばんは ${Date.now()}`;
  const box = page.getByRole("textbox", { name: "テストの部屋 に書く" });
  await box.fill(text);
  await box.press("Enter");

  const sent = await waitForEvent(
    { authors: [me.pubkey], kinds: [42] },
    (event) => event.content === text,
  );
  // チャンネルを root、返信先を reply で指し、返信先の人を p に入れる。
  expect(sent.tags.map((tag) => [tag[0], tag[1], tag[3]])).toEqual([
    ["e", channel.id, "root"],
    ["e", hello.id, "reply"],
    ["p", owner.pubkey, undefined],
  ]);
  await expect(
    page.getByRole("article").filter({ hasText: text }),
  ).toBeVisible();
  await expect(box).toHaveValue("");
});

test("カラムを追加からチャンネルを選び、お気に入りに入れられる", async ({
  page,
  me,
  openApp,
  signIn,
}) => {
  const owner = await createUser("owner");
  const name = `一覧の部屋 ${Date.now()}`;
  const channel = await owner.post({
    kind: 40,
    content: JSON.stringify({ name, relays: [RELAY_URL] }),
  });
  await owner.post({
    kind: 42,
    content: "だれかいますか",
    tags: [["e", channel.id, RELAY_URL, "root"]],
  });

  await openApp();
  await signIn();
  await page
    .getByRole("button", { name: "カラムを追加", exact: true })
    .first()
    .click();
  await page.getByRole("button", { name: /^チャンネル/ }).click();

  // パネルの「最近アクティブなチャンネル」に出る。★ でお気に入りに入れる。
  await page
    .getByRole("button", { name: `${name} をお気に入りに入れる` })
    .click();
  const list = await waitForEvent(
    { authors: [me.pubkey], kinds: [10005] },
    (event) =>
      event.tags.some((tag) => tag[0] === "e" && tag[1] === channel.id),
  );
  expect(list.tags).toContainEqual(["e", channel.id]);

  // 押すと、そのチャンネルがデッキのカラムとして足される。
  await page
    .getByRole("button", { name: new RegExp(name) })
    .first()
    .click();
  await expect(page.getByRole("heading", { name })).toBeVisible();
  await expect(page.getByText("だれかいますか")).toBeVisible();
});

test("チャンネルを作り、情報を直せる", async ({
  page,
  me,
  openApp,
  signIn,
}) => {
  await openApp();
  await signIn();
  await page
    .getByRole("button", { name: "カラムを追加", exact: true })
    .first()
    .click();
  await page.getByRole("button", { name: /^チャンネル/ }).click();
  await page.getByRole("button", { name: "チャンネルを作る" }).click();

  const dialog = page.getByRole("dialog", { name: "チャンネルを作る" });
  const name = `作った部屋 ${Date.now()}`;
  await dialog.getByRole("textbox", { name: "名前（必須）" }).fill(name);

  // 書きかけのまま閉じようとしても閉じない。
  await page.keyboard.press("Escape");
  await expect(
    dialog.getByText("保存するか、やめてから閉じてください"),
  ).toBeVisible();

  await dialog.getByRole("button", { name: "チャンネルを作る" }).click();
  const created = await waitForEvent(
    { authors: [me.pubkey], kinds: [40] },
    (event) => event.content.includes(name),
  );
  expect(JSON.parse(created.content).relays.length).toBeGreaterThan(0);
  // 作ったらお気に入りに入れる（既定で入）。
  await waitForEvent({ authors: [me.pubkey], kinds: [10005] }, (event) =>
    event.tags.some((tag) => tag[0] === "e" && tag[1] === created.id),
  );
  await expect(dialog).toBeHidden();

  // 作ったチャンネルがデッキのカラムになる。ⓘ から情報を開いて直す。
  const column = page.locator("section").filter({
    has: page.getByRole("heading", { name }),
  });
  await column.getByRole("button", { name: "チャンネルの情報" }).click();
  await page.getByRole("button", { name: "情報を直す" }).click();
  const edit = page.getByRole("dialog", { name: "チャンネルの情報を直す" });
  await edit.getByRole("textbox", { name: "説明" }).fill("新しい説明");
  await edit.getByRole("button", { name: "保存" }).click();
  const updated = await waitForEvent(
    { authors: [me.pubkey], kinds: [41] },
    (event) =>
      event.tags.some((tag) => tag[0] === "e" && tag[1] === created.id),
  );
  expect(JSON.parse(updated.content)).toMatchObject({
    name,
    about: "新しい説明",
  });
});

test("チャンネルの発言をミュートできる", async ({
  page,
  me,
  openApp,
  signIn,
}) => {
  const owner = await createUser("owner");
  const channel = await owner.post({
    kind: 40,
    content: JSON.stringify({ name: "ミュートの部屋", relays: [RELAY_URL] }),
  });
  const spam = await owner.post({
    kind: 42,
    content: `宣伝です ${Date.now()}`,
    tags: [["e", channel.id, RELAY_URL, "root"]],
  });

  await openApp();
  await signIn();
  const nevent = encodeNevent({
    id: channel.id,
    relays: [RELAY_URL],
    eventKind: 40,
  });
  await page.goto(`/${nevent}?relays=${encodeURIComponent(RELAY_URL)}`);

  const message = page.getByRole("article").filter({ hasText: spam.content });
  await message.hover();
  await message.getByRole("button", { name: "そのほかの操作" }).click();
  await page
    .getByRole("menuitem", { name: "このメッセージをミュートする" })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "このメッセージをミュートする",
  });
  await dialog.getByRole("textbox", { name: "理由（任意）" }).fill("宣伝");
  await dialog.getByRole("button", { name: "ミュートする" }).click();

  const hide = await waitForEvent(
    { authors: [me.pubkey], kinds: [43] },
    (event) => event.tags.some((tag) => tag[0] === "e" && tag[1] === spam.id),
  );
  expect(JSON.parse(hide.content)).toEqual({ reason: "宣伝" });
  // 消さずに畳む。押せば読める。
  await expect(page.getByText("ミュートしたメッセージです")).toBeVisible();
  await page.getByRole("button", { name: "表示する" }).click();
  await expect(page.getByText(spam.content)).toBeVisible();
});
