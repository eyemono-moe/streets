import { type Page, expect, test } from "@playwright/test";
import {
  notificationRelayUrl,
  notificationReplyText,
  notificationViewerPubkey,
} from "./fixtures/seed-notification.js";

/**
 * ログインは `getPublicKey()` しか呼ばない (`v1.tsx` の `login()`) ので、
 * 本物の署名は要らない。この spec は何も publish しない。
 */
const stubReadOnlySigner = async (page: Page) => {
  await page.addInitScript((viewerPubkey: string) => {
    (window as typeof window & { nostr: unknown }).nostr = {
      getPublicKey: async () => viewerPubkey,
      signEvent: async (event: Record<string, unknown>) => ({
        ...event,
        id: "playwright-notification-mock-event-id",
        pubkey: viewerPubkey,
        sig: "playwright-notification-mock-signature",
      }),
    };
  }, notificationViewerPubkey);
};

test("通知カラムは自分宛だけを集め、自分の行動を出さない", async ({ page }) => {
  await stubReadOnlySigner(page);
  await page.goto(`/v1?relays=${encodeURIComponent(notificationRelayUrl)}`);
  await page.getByTestId("login").click();

  // UI から実際に足す —— buildColumn / AddColumnForm の配線まで通す
  // (e2e/v1.spec.ts の global 列追加と同じ手順)。
  await page.getByTestId("add-column").click();
  await expect(page.getByTestId("add-column-form")).toBeVisible();
  await page.getByTestId("add-column-kind-notifications").click();
  await page.getByTestId("add-column-submit").click();

  const column = page
    .getByTestId("deck-column")
    .filter({ hasText: "通知" })
    .first();

  // 他人からの返信が出る。
  await expect(column).toContainText(notificationReplyText, {
    timeout: 20_000,
  });

  // 対照: 他人のリアクション (+) が通知行として出ている。`+` は
  // `ReactionMark` がハートアイコン (testid `reaction-like`) で描き文字列
  // としては残らないので、テキスト一致ではなくこのアイコンの testid で見る。
  // **`reacted-by` (通知行そのものの見出し) の中に絞る**のが要 ——
  // 絞らないと、リポスト通知行が完全表示する ownNote に付随する
  // `ReactionList` の `reaction-group` チップ (`ReactionList.tsx`) からも
  // 同じ `reaction-like` が生えるため、kind:7 の通知行そのものが丸ごと
  // 消えるバグが入っても対照は「装飾のチップ」だけを拾って PASS し続けて
  // しまい、🚫 側の `reacted-by` 絞り込みと非対称になる。**この主張が無いと、
  // 下の「自分のリアクションが出ない」はカラムが空でも通ってしまう。**
  await expect(
    column.getByTestId("reacted-by").getByTestId("reaction-like"),
  ).not.toHaveCount(0);

  // 自分のリアクション (🚫) は通知列そのものには出ない。`reacted-by`
  // (`Reaction.tsx` の見出し) は kind:7 そのものの描画にしか付かない
  // testid で、返信・リポストが完全表示する対象ノートに付いた
  // `ReactionList` (仕様 2.1 節「巻き添えを間引かない」で意図的に残る)
  // の `reaction-group` とは別物 —— なので `item` 全体のテキストではなく
  // ここを見ないと、間引かれない巻き添え表示を誤って失敗と数えてしまう。
  await expect(
    column.getByTestId("reacted-by").filter({ hasText: "🚫" }),
  ).toHaveCount(0);
});
