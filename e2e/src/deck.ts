import type { Page } from "@playwright/test";

/** 見出しの名前でカラムを探す。広い画面の並べたカラムだけで使える。 */
export const column = (page: Page, title: string) =>
  page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: title, exact: true }) });
