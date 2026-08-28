import { type Page, expect, test } from "@playwright/test";
import type { Event, EventTemplate } from "nostr-tools";
import { Relay } from "nostr-tools";
import {
  previewAuthorOneNoteId,
  previewAuthorOneNoteText,
  previewAuthorOnePubkey,
  previewAuthorTwoPubkey,
  previewRelayUrl,
  previewViewerPubkey,
  signAsPreviewAuthorTwo,
  signAsPreviewViewer,
} from "./fixtures/seed-preview.js";

const previewAuthorOneColumnNote = (page: Page) =>
  page.locator(
    `[data-testid="item"] > [data-testid="event-view"][data-event-id="${previewAuthorOneNoteId()}"]`,
  );

const stubSigner = async (page: Page) => {
  await page.exposeFunction(
    "__streetsSignMuteEvent",
    (template: EventTemplate) => signAsPreviewViewer(template),
  );
  await page.addInitScript((viewerPubkey: string) => {
    const win = window as typeof window & {
      nostr: unknown;
      __streetsSignMuteEvent(template: unknown): Promise<unknown>;
    };
    win.nostr = {
      getPublicKey: async () => viewerPubkey,
      signEvent: (template: unknown) => win.__streetsSignMuteEvent(template),
      nip44: {
        encrypt: async (_peer: string, plaintext: string) =>
          `mock44:${encodeURIComponent(plaintext)}`,
        decrypt: async (_peer: string, ciphertext: string) => {
          if (!ciphertext.startsWith("mock44:")) throw new Error("invalid");
          return decodeURIComponent(ciphertext.slice("mock44:".length));
        },
      },
    };
  }, previewViewerPubkey);
};

const stubSignerWithoutNip44 = async (page: Page) => {
  await page.exposeFunction(
    "__streetsSignPublicMuteEvent",
    (template: EventTemplate) => signAsPreviewAuthorTwo(template),
  );
  await page.addInitScript((viewerPubkey: string) => {
    const win = window as typeof window & {
      nostr: unknown;
      __streetsSignPublicMuteEvent(template: unknown): Promise<unknown>;
    };
    win.nostr = {
      getPublicKey: async () => viewerPubkey,
      signEvent: (template: unknown) =>
        win.__streetsSignPublicMuteEvent(template),
    };
  }, previewAuthorTwoPubkey);
};

const latestMuteEvent = async (
  author = previewViewerPubkey,
): Promise<Event | undefined> => {
  const relay = await Relay.connect(previewRelayUrl);
  try {
    const events: Event[] = [];
    await new Promise<void>((resolve) => {
      const subscription = relay.subscribe(
        [{ kinds: [10_000], authors: [author] }],
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
  } finally {
    relay.close();
  }
};

const resetViewerMuteList = async (): Promise<void> => {
  const current = await latestMuteEvent();
  const relay = await Relay.connect(previewRelayUrl);
  try {
    await relay.publish(
      signAsPreviewViewer({
        kind: 10_000,
        created_at: Math.max(
          Math.floor(Date.now() / 1_000),
          (current?.created_at ?? 0) + 1,
        ),
        tags: [],
        content: "",
      }),
    );
  } finally {
    relay.close();
  }
};

// 同じローカルリレーを繰り返し使っても、過去実行や途中失敗のミュートを
// 次のテストと後続の v1.spec.ts へ持ち越さない。
test.beforeEach(resetViewerMuteList);
test.afterEach(resetViewerMuteList);

test("イベントメニューから著者とスレッドをミュートする", async ({ page }) => {
  test.setTimeout(60_000);
  await stubSigner(page);
  await page.goto(`/v1?relays=${encodeURIComponent(previewRelayUrl)}`);
  await page.getByTestId("login").click();
  await expect(page.getByTestId("viewer-pubkey")).toHaveText(
    previewViewerPubkey,
    { timeout: 15_000 },
  );
  await expect(previewAuthorOneColumnNote(page)).toContainText(
    previewAuthorOneNoteText,
    { timeout: 20_000 },
  );

  // 著者を非公開部へ追加し、設定から解除すると Store の本文が即座に戻る。
  let note = previewAuthorOneColumnNote(page);
  await note.getByTestId("event-menu-trigger").click();
  await page
    .getByRole("menuitem", { name: "この著者をミュート", exact: true })
    .click();
  await expect(
    page.getByText(previewAuthorOneNoteText, { exact: true }),
  ).toHaveCount(0);
  await page.getByTestId("settings-open").click();
  await page.getByTestId("settings-tab-mutes").click();
  let row = page
    .getByTestId("mute-settings-row")
    .filter({ hasText: "著者" })
    .first();
  await expect(row).toBeVisible({ timeout: 15_000 });
  expect((await latestMuteEvent())?.content).toContain(
    encodeURIComponent(previewAuthorOnePubkey),
  );
  await row.getByTestId("mute-remove").click();
  await expect(row).toHaveCount(0);
  await page.getByTestId("settings-close").click();
  await expect(previewAuthorOneColumnNote(page)).toContainText(
    previewAuthorOneNoteText,
    { timeout: 5_000 },
  );

  // 同じメニューのスレッド対象も実配線を通す。
  note = previewAuthorOneColumnNote(page);
  await note.getByTestId("event-menu-trigger").click();
  await page
    .getByRole("menuitem", {
      name: "このスレッドをミュート",
      exact: true,
    })
    .click();
  await expect(
    page.getByText(previewAuthorOneNoteText, { exact: true }),
  ).toHaveCount(0);
  const threadStored = await latestMuteEvent();
  expect(threadStored?.tags.some((tag) => tag[0] === "e")).toBe(false);
  const privateTags = JSON.parse(
    decodeURIComponent(
      threadStored?.content.replace(/^mock44:/, "") ?? "%5B%5D",
    ),
  ) as string[][];
  expect(privateTags.some((tag) => tag[0] === "e")).toBe(true);
  await page.getByTestId("settings-open").click();
  await page.getByTestId("settings-tab-mutes").click();
  row = page
    .getByTestId("mute-settings-row")
    .filter({ hasText: "スレッド" })
    .first();
  await expect(row).toBeVisible({ timeout: 15_000 });
  await row.getByTestId("mute-remove").click();
  await expect(row).toHaveCount(0);
});

test("設定で明示した対象だけを公開ミュートへ保存する", async ({ page }) => {
  test.setTimeout(60_000);
  await stubSigner(page);
  await page.goto(`/v1?relays=${encodeURIComponent(previewRelayUrl)}`);
  await page.getByTestId("login").click();
  await expect(page.getByTestId("viewer-pubkey")).toHaveText(
    previewViewerPubkey,
    { timeout: 15_000 },
  );
  await page.getByTestId("settings-open").click();
  await page.getByTestId("settings-tab-mutes").click();
  await expect(page.getByText("ミュートリストを取得しています…")).toHaveCount(
    0,
    { timeout: 15_000 },
  );

  const publicValue = "public-mute-e2e";
  await page.getByTestId("mute-type-word").click();
  await page.getByTestId("mute-value-input").fill(publicValue);
  await page
    .locator('[aria-label="公開範囲"]')
    .getByText("公開", { exact: true })
    .click();
  await page.getByTestId("mute-add").click();
  const row = page
    .getByTestId("mute-settings-row")
    .filter({ hasText: publicValue });
  await expect(row).toBeVisible({ timeout: 15_000 });
  // UI の公開選択が、暗号文ではなく public tags に届いたことを実測する。
  expect((await latestMuteEvent())?.tags).toContainEqual(["word", publicValue]);
  await row.getByTestId("mute-remove").click();
  await expect(row).toHaveCount(0);
});

test("非公開ミュートを保存・復元・解除する", async ({ page }) => {
  test.setTimeout(60_000);
  await stubSigner(page);
  await page.goto(`/v1?relays=${encodeURIComponent(previewRelayUrl)}`);
  await page.getByTestId("login").click();
  await expect(page.getByTestId("viewer-pubkey")).toHaveText(
    previewViewerPubkey,
    { timeout: 15_000 },
  );
  await expect(previewAuthorOneColumnNote(page)).toContainText(
    previewAuthorOneNoteText,
    { timeout: 20_000 },
  );

  await page.getByTestId("settings-open").click();
  await page.getByTestId("settings-tab-mutes").click();
  await expect(page.getByText("ミュートリストを取得しています…")).toHaveCount(
    0,
    {
      timeout: 15_000,
    },
  );
  await page.getByTestId("mute-type-word").click();
  await page.getByTestId("mute-value-input").fill(previewAuthorOneNoteText);
  await page.getByTestId("mute-add").click();

  const row = page
    .getByTestId("mute-settings-row")
    .filter({ hasText: previewAuthorOneNoteText })
    .last();
  await expect(row).toBeVisible({ timeout: 15_000 });
  await expect(row.getByTestId("mute-private-toggle")).toHaveAttribute(
    "data-state",
    "on",
  );

  // 捕まえる変異: 非公開指定を public tags へ保存し、対象を外部へ漏らす。
  const stored = await latestMuteEvent();
  expect(stored?.tags).not.toContainEqual(["word", previewAuthorOneNoteText]);
  expect(stored?.content.startsWith("mock44:")).toBe(true);

  await page.getByTestId("settings-close").click();
  await expect(
    page.getByText(previewAuthorOneNoteText, { exact: true }),
  ).toHaveCount(0);

  // リロード後も kind:10000 を取り直して復号し、表示へ適用する。
  await page.reload();
  await page.getByTestId("login").click();
  await expect(page.getByTestId("viewer-pubkey")).toHaveText(
    previewViewerPubkey,
    { timeout: 15_000 },
  );
  await expect(
    page.getByText(previewAuthorOneNoteText, { exact: true }),
  ).toHaveCount(0, {
    timeout: 20_000,
  });

  await page.getByTestId("settings-open").click();
  await page.getByTestId("settings-tab-mutes").click();
  const restored = page
    .getByTestId("mute-settings-row")
    .filter({ hasText: previewAuthorOneNoteText })
    .last();
  await expect(restored).toBeVisible({ timeout: 15_000 });
  await restored.getByTestId("mute-remove").click();
  await expect(restored).toHaveCount(0);
  await page.getByTestId("settings-close").click();

  // Store から捨てていないため、解除後は再購読を待たずに戻る。
  await expect(previewAuthorOneColumnNote(page)).toContainText(
    previewAuthorOneNoteText,
    { timeout: 5_000 },
  );
});

test("NIP-44 非対応時に非公開対象を公開しない", async ({ page }) => {
  test.setTimeout(60_000);
  await stubSignerWithoutNip44(page);
  await page.goto(`/v1?relays=${encodeURIComponent(previewRelayUrl)}`);
  await page.getByTestId("login").click();
  await expect(page.getByTestId("viewer-pubkey")).toHaveText(
    previewAuthorTwoPubkey,
    { timeout: 15_000 },
  );
  await page.getByTestId("settings-open").click();
  await page.getByTestId("settings-tab-mutes").click();
  await expect(page.getByText("ミュートリストを取得しています…")).toHaveCount(
    0,
    { timeout: 15_000 },
  );

  const privateValue = "must-not-leak-e2e";
  await page.getByTestId("mute-type-word").click();
  await page.getByTestId("mute-value-input").fill(privateValue);
  await page.getByTestId("mute-add").click();
  await expect(page.getByText(/非公開ミュートには NIP-44/)).toBeVisible();

  // 捕まえる変異: 能力不足を public 保存へ縮退して対象を tags に載せる。
  const stored = await latestMuteEvent(previewAuthorTwoPubkey);
  expect(stored?.tags ?? []).not.toContainEqual(["word", privateValue]);
});
