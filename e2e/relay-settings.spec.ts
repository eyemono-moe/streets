import { type Page, expect, test } from "@playwright/test";
import type { EventTemplate } from "nostr-tools";
import { Relay } from "nostr-tools";
import { relayTwoUrl } from "./fixtures/seed-outbox.js";
import {
  previewRelayUrl,
  previewViewerPubkey,
  signAsPreviewAuthorOne,
  signAsPreviewViewer,
} from "./fixtures/seed-preview.js";

const stubSigner = async (page: Page) => {
  await page.exposeFunction(
    "__streetsSignRelaySettings",
    (template: EventTemplate) => signAsPreviewViewer(template),
  );
  await page.addInitScript((viewerPubkey: string) => {
    const win = window as typeof window & {
      nostr: {
        getPublicKey(): Promise<string>;
        signEvent(template: unknown): Promise<unknown>;
      };
      __streetsSignRelaySettings(template: unknown): Promise<unknown>;
    };
    win.nostr = {
      getPublicKey: async () => viewerPubkey,
      signEvent: async (template) => win.__streetsSignRelaySettings(template),
    };
  }, previewViewerPubkey);
};

const relayRow = (page: Page, url: string) =>
  page
    .getByTestId("relay-settings-list")
    .locator(":scope > div")
    .filter({ hasText: url })
    .first();

const saveRelaySettings = async (page: Page) => {
  const save = page.getByTestId("relay-save");
  await save.click();
  await expect(save).toHaveText("保存");
  await expect(save).toBeDisabled();
  await expect(page.getByTestId("relay-settings-error")).toHaveCount(0);
};

test("設定した read リレーへ通知カラムを保存直後に切り替える", async ({
  page,
}) => {
  // 捕まえる変異: `?relays=` で通知カラムまでリレー1へ固定し、保存後も
  // NIP-65 の新しい read リレー（リレー2）へ再購読しない。
  test.setTimeout(60_000);
  await stubSigner(page);
  await page.goto(`/v1?relays=${encodeURIComponent(previewRelayUrl)}`);
  await page.getByTestId("login").click();
  await expect(page.getByTestId("viewer-pubkey")).toHaveText(
    previewViewerPubkey,
    { timeout: 15_000 },
  );

  // Penpot の 880 x 640 のカードと暗色スクラム。背景面の
  // bg.secondary をスクラムへ誤用する変異も透明度の主張で捕まえる。
  await page.getByTestId("settings-open").click();
  const dialog = page.getByTestId("settings-dialog");
  await expect(dialog).toBeVisible();
  await expect(page.getByTestId("relay-settings-loading")).toHaveCount(0, {
    timeout: 15_000,
  });
  const box = await dialog.boundingBox();
  expect(box?.width).toBe(880);
  expect(box?.height).toBe(640);
  const backdropColor = await page
    .getByTestId("settings-backdrop")
    .evaluate((element) => getComputedStyle(element).backgroundColor);
  expect(backdropColor).toContain("/ 0.55");

  // 内側のクリックは閉じず、Escape は閉じて起点へフォーカスを返す。
  await page.getByText("リレー設定", { exact: true }).click();
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(page.getByTestId("settings-open")).toBeFocused();
  await page.getByTestId("settings-open").click();
  await expect(page.getByTestId("relay-settings-loading")).toHaveCount(0, {
    timeout: 15_000,
  });

  // 実行を繰り返しても同じ初期条件に戻せるよう、リレー2を一度外し、
  // リレー1を read + write に揃える。
  const secondBefore = relayRow(page, `${relayTwoUrl}/`);
  if ((await secondBefore.count()) > 0) {
    await secondBefore.getByTestId("relay-remove").click();
  }
  const first = relayRow(page, `${previewRelayUrl}/`);
  const firstRead = first.getByTestId("relay-read-toggle");
  if ((await firstRead.getAttribute("data-state")) !== "on") {
    await firstRead.click();
  }
  if (await page.getByTestId("relay-save").isEnabled()) {
    await saveRelaySettings(page);
  }
  await page.getByTestId("settings-close").click();

  // 通知カラムを旧 read リレー（リレー1）へ接続した状態にする。
  await page.getByTestId("add-column").click();
  await page.getByTestId("add-column-kind-notifications").click();
  await page.getByTestId("add-column-submit").click();
  const notificationColumn = page
    .getByTestId("deck-column")
    .filter({ hasText: "通知" })
    .last();
  await expect(notificationColumn).toBeVisible();

  // read をリレー1からリレー2へ変更する。保存による EventStore の変更通知が
  // source memo と ReadLayer の replan へ届かなければ、下でリレー2だけへ
  // 発行する通知は表示されない。
  await page.getByTestId("settings-open").click();
  await firstRead.click();
  await page.getByTestId("relay-url-input").fill(relayTwoUrl);
  await page.getByTestId("relay-add").click();
  await saveRelaySettings(page);
  await page.getByTestId("settings-close").click();

  const notificationText = `relay settings notification ${Date.now()}`;
  const secondRelay = await Relay.connect(relayTwoUrl);
  try {
    await secondRelay.publish(
      signAsPreviewAuthorOne({
        kind: 1,
        created_at: Math.floor(Date.now() / 1000),
        tags: [["p", previewViewerPubkey]],
        content: notificationText,
      }),
    );
  } finally {
    secondRelay.close();
  }

  await expect(notificationColumn).toContainText(notificationText, {
    timeout: 20_000,
  });

  // 保存後の値を Context の current から再構築できる。
  await page.getByTestId("settings-open").click();
  await expect(relayRow(page, `${relayTwoUrl}/`)).toBeVisible();
  await expect(
    relayRow(page, `${previewRelayUrl}/`).getByTestId("relay-read-toggle"),
  ).toHaveAttribute("data-state", "off");

  // 全 spec が同じリレーを共有するため、後続の投稿テストが期待する
  // 「preview viewer はリレー1の write-only」へ UI 経由で戻す。
  // 固定 created_at の seed は今保存した新版を上書きできないので、
  // globalSetup へ任せず、このテスト自身が片付ける。
  await relayRow(page, `${relayTwoUrl}/`).getByTestId("relay-remove").click();
  await saveRelaySettings(page);
  await page.getByTestId("settings-close").click();
});
