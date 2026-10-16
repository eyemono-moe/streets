import type { Page } from "@playwright/test";
import { RELAY_URL } from "../src/env";
import { expect, test } from "../src/fixtures";
import { waitForEvent } from "../src/relay";

type Shared = { title?: string; text?: string; url?: string; image?: string };

/**
 * ほかのアプリの共有メニューから Streets を選んだときと同じ形で、`/share` へ
 * multipart で POST する。受けるのは Service Worker なので、効くまで待ってから送る。
 */
const share = async (page: Page, shared: Shared) => {
  await page.evaluate(
    async ({ shared, relays }) => {
      await navigator.serviceWorker.ready;
      const form = document.createElement("form");
      form.method = "post";
      form.enctype = "multipart/form-data";
      form.action = `/share?relays=${encodeURIComponent(relays)}`;
      for (const name of ["title", "text", "url"] as const) {
        const value = shared[name];
        if (value === undefined) continue;
        const input = document.createElement("input");
        input.name = name;
        input.value = value;
        form.append(input);
      }
      if (shared.image) {
        const files = new DataTransfer();
        // 1×1 の透明な PNG。
        const png = Uint8Array.from(
          atob(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
          ),
          (c) => c.charCodeAt(0),
        );
        files.items.add(new File([png], shared.image, { type: "image/png" }));
        const input = document.createElement("input");
        input.type = "file";
        input.name = "media";
        input.files = files.files;
        form.append(input);
      }
      document.body.append(form);
      form.submit();
    },
    { shared, relays: RELAY_URL },
  );
};

test("共有された文と画像が入った投稿パネルが開き、そのまま投稿できる", async ({
  page,
  me,
  openApp,
  signIn,
}) => {
  await openApp();
  await signIn();

  await share(page, {
    title: "記事の題",
    url: "https://example.invalid/article",
    image: "shared.png",
  });

  const body = page.getByRole("textbox", { name: "ノートの本文" });
  await expect(body).toHaveValue("記事の題\nhttps://example.invalid/article");
  // 画像を送るにはアップロード先が要る。届いたことだけ確かめて外す。
  await page.getByRole("button", { name: "shared.png を外す" }).click();
  await page.getByRole("button", { name: "投稿", exact: true }).click();

  await waitForEvent(
    { authors: [me.pubkey], kinds: [1] },
    (event) => event.content === "記事の題\nhttps://example.invalid/article",
  );
});

test("ログインしていないときに共有されたら、ログインした後に投稿パネルが開く", async ({
  page,
  openApp,
  signIn,
}) => {
  await openApp();

  await share(page, { text: "ログイン前に共有した文" });
  await expect(
    page.getByText("ログインすると、共有された内容の投稿ができます"),
  ).toBeVisible();

  await signIn();
  await expect(page.getByRole("textbox", { name: "ノートの本文" })).toHaveValue(
    "ログイン前に共有した文",
  );
});
