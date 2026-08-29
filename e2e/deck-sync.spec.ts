import { type BrowserContext, type Page, expect, test } from "@playwright/test";
import type { Event } from "nostr-tools";
import { Relay } from "nostr-tools";
import {
  deckSyncPubkey,
  installDeckSyncSigner,
  signAsDeckSyncViewer,
} from "./fixtures/deck-sync.js";
import { previewRelayUrl } from "./fixtures/seed-preview.js";

const identifier = "moe.eyemono.streets/deck";
const encrypted = (plaintext: string) =>
  `deck-sync-nip44:${encodeURIComponent(plaintext)}`;

const baselineDeck = (title: string) => ({
  version: 2 as const,
  columns: [
    {
      id: "sync",
      title,
      source: {
        kind: "literal" as const,
        filters: [{ kinds: [1], authors: [deckSyncPubkey] }],
        relays: [previewRelayUrl],
      },
    },
  ],
});

const latestRemote = async (relay: Relay): Promise<Event | undefined> => {
  const events: Event[] = [];
  await new Promise<void>((resolve) => {
    const subscription = relay.subscribe(
      [{ kinds: [30_078], authors: [deckSyncPubkey], "#d": [identifier] }],
      {
        onevent: (event) => events.push(event),
        oneose: () => {
          subscription.close();
          resolve();
        },
      },
    );
  });
  return events.sort(
    (left, right) =>
      right.created_at - left.created_at || right.id.localeCompare(left.id),
  )[0];
};

const resetRemote = async (title: string): Promise<void> => {
  const relay = await Relay.connect(previewRelayUrl);
  try {
    const current = await latestRemote(relay);
    await relay.publish(
      signAsDeckSyncViewer({
        kind: 30_078,
        created_at: Math.max(
          Math.floor(Date.now() / 1_000),
          (current?.created_at ?? 0) + 1,
        ),
        tags: [["d", identifier]],
        content: encrypted(JSON.stringify(baselineDeck(title))),
      }),
    );
  } finally {
    relay.close();
  }
};

const login = async (page: Page) => {
  await page.goto(`/v1?relays=${encodeURIComponent(previewRelayUrl)}`);
  await page.getByTestId("login").click();
  await expect(page.getByTestId("viewer-pubkey")).toHaveText(deckSyncPubkey, {
    timeout: 15_000,
  });
};

const createDevice = async (browser: {
  newContext(): Promise<BrowserContext>;
}): Promise<{ context: BrowserContext; page: Page }> => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await installDeckSyncSigner(page);
  await login(page);
  return { context, page };
};

const renameFirstColumn = async (page: Page, title: string) => {
  const titleControl = page.getByTestId("deck-column-title").first();
  await titleControl.click();
  await titleControl.fill(title);
  await titleControl.press("Enter");
  await expect(page.getByTestId("deck-column-title").first()).toHaveText(title);
};

const openAccountSettings = async (page: Page) => {
  await page.getByTestId("settings-open").click();
  await expect(page.getByTestId("deck-sync-state")).toBeVisible();
};

const waitForSynced = async (page: Page) => {
  await openAccountSettings(page);
  await expect(page.getByTestId("deck-sync-state")).toContainText("同期済み", {
    timeout: 15_000,
  });
  await page.getByTestId("settings-close").click();
};

test("kind:30078で端末間復元、競合の両解決、dirty再開を通す", async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const baselineTitle = `同期の基準 ${Date.now()}`;
  await resetRemote(baselineTitle);

  const deviceA = await createDevice(browser);
  const deviceB = await createDevice(browser);
  try {
    // remote より先に既定デッキを確定してはならない。新端末はリレーの
    // 1 カラムを復元する（`#d` の wire filter は fetch-latest.test.ts が固定）。
    await expect(deviceA.page.getByTestId("deck-column-title")).toHaveText(
      baselineTitle,
      { timeout: 15_000 },
    );
    await expect(deviceB.page.getByTestId("deck-column-title")).toHaveText(
      baselineTitle,
      { timeout: 15_000 },
    );

    const firstRemoteTitle = `端末A ${Date.now()}`;
    await renameFirstColumn(deviceA.page, firstRemoteTitle);
    await waitForSynced(deviceA.page);

    // B は古い base のまま編集する。Writer の mutation 内で remote id を
    // 比較しなければ、A の変更を B が無言で上書きしてしまう。
    await renameFirstColumn(deviceB.page, `端末Bで競合 ${Date.now()}`);
    await expect(deviceB.page.getByTestId("deck-sync-attention")).toBeVisible({
      timeout: 15_000,
    });
    await deviceB.page.getByTestId("deck-sync-attention").click();
    await expect(deviceB.page.getByTestId("deck-sync-state")).toContainText(
      "両方変更されています",
    );
    await deviceB.page.getByTestId("deck-sync-use-remote").click();
    await deviceB.page.getByTestId("settings-close").click();
    await expect(deviceB.page.getByTestId("deck-column-title")).toHaveText(
      firstRemoteTitle,
    );

    // B の base を据え置いたまま A がもう一度進め、今度は local を選ぶ。
    await renameFirstColumn(deviceA.page, `端末Aの新版 ${Date.now()}`);
    await waitForSynced(deviceA.page);
    const keptLocalTitle = `端末Bを採用 ${Date.now()}`;
    await renameFirstColumn(deviceB.page, keptLocalTitle);
    await expect(deviceB.page.getByTestId("deck-sync-attention")).toBeVisible({
      timeout: 15_000,
    });
    await deviceB.page.getByTestId("deck-sync-attention").click();
    await deviceB.page.getByTestId("deck-sync-keep-local").click();
    await expect(deviceB.page.getByTestId("deck-sync-state")).toContainText(
      "同期済み",
      { timeout: 15_000 },
    );
    await deviceB.page.getByTestId("settings-close").click();

    // デバウンス前の reload でも平文 cache の dirty を失わず、ログイン後に
    // 保存を再開する。beforeunload で署名を始める実装には依存しない。
    const resumedTitle = `再開した変更 ${Date.now()}`;
    await renameFirstColumn(deviceB.page, resumedTitle);
    await deviceB.page.reload();
    await deviceB.page.getByTestId("login").click();
    await expect(deviceB.page.getByTestId("deck-column-title")).toHaveText(
      resumedTitle,
      { timeout: 15_000 },
    );
    await waitForSynced(deviceB.page);

    const deviceC = await createDevice(browser);
    try {
      await expect(deviceC.page.getByTestId("deck-column-title")).toHaveText(
        resumedTitle,
        { timeout: 15_000 },
      );
    } finally {
      await deviceC.context.close();
    }
  } finally {
    await deviceA.context.close();
    await deviceB.context.close();
  }
});
