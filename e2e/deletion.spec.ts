import { type Page, expect, test } from "@playwright/test";
import { type EventTemplate, Relay } from "nostr-tools";
import {
  deletionAuthorPubkey,
  deletionForgedAuthorPubkey,
  deletionRelayUrl,
  deletionViewerPubkey,
  signAsDeletionAuthor,
  signAsForgedDeletionAuthor,
} from "./fixtures/seed-deletion.js";

const seedDeck = async (page: Page) => {
  await page.addInitScript(
    ({ viewer, author, forged, relay }) => {
      window.localStorage.setItem(
        `streets.v1.deck.${viewer}`,
        JSON.stringify({
          version: 2,
          columns: [
            {
              id: "deletion",
              title: "deletion",
              source: {
                kind: "literal",
                filters: [{ kinds: [1, 5, 30078], authors: [author, forged] }],
                relays: [relay],
              },
            },
          ],
        }),
      );
    },
    {
      viewer: deletionViewerPubkey,
      author: deletionAuthorPubkey,
      forged: deletionForgedAuthorPubkey,
      relay: deletionRelayUrl,
    },
  );
};

const publish = async (
  template: EventTemplate,
  sign = signAsDeletionAuthor,
) => {
  const relay = await Relay.connect(deletionRelayUrl);
  try {
    const event = sign(template);
    await relay.publish(event);
    return event;
  } finally {
    relay.close();
  }
};

const publishEvent = async (event: ReturnType<typeof signAsDeletionAuthor>) => {
  const relay = await Relay.connect(deletionRelayUrl);
  try {
    await relay.publish(event);
  } finally {
    relay.close();
  }
};

const open = async (page: Page) => {
  // 読み取り専用の spec。ログインは getPublicKey() しか呼ばないので、署名は
  // ダミーでよい（thread.spec.ts と同じ境界）。
  await page.addInitScript((viewerPubkey: string) => {
    (window as typeof window & { nostr: unknown }).nostr = {
      getPublicKey: async () => viewerPubkey,
      signEvent: async (event: Record<string, unknown>) => ({
        ...event,
        id: "playwright-deletion-mock-event-id",
        pubkey: viewerPubkey,
        sig: "playwright-deletion-mock-signature",
      }),
    };
  }, deletionViewerPubkey);
  await seedDeck(page);
  await page.goto(`/v1?relays=${encodeURIComponent(deletionRelayUrl)}`);
  await page.getByTestId("login").click();
  await expect(page.getByTestId("viewer-pubkey")).toHaveText(
    deletionViewerPubkey,
    { timeout: 15_000 },
  );
  return page.locator('[data-testid="deck-column"][data-column-id="deletion"]');
};

const target = (content: string, createdAt: number) =>
  publish({ kind: 1, created_at: createdAt, tags: [], content });

const deletion = (
  targetId: string,
  createdAt: number,
  author = deletionAuthorPubkey,
) =>
  publish(
    {
      kind: 5,
      created_at: createdAt,
      tags: [
        ["e", targetId],
        ["k", "1"],
      ],
      content: "",
    },
    author === deletionAuthorPubkey
      ? signAsDeletionAuthor
      : signAsForgedDeletionAuthor,
  );

const marker = (content: string, createdAt: number) =>
  target(content, createdAt);

test.describe("NIP-09 deletion", () => {
  test("target先着・deletion先着・別著者・a座標をlive反映する", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const column = await open(page);
    const nonce = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    // リレーは未来時刻を拒否する。順序づけに必要な 14 秒分を現在より十分
    // 前へ置き、実行中に時計が進む速さへ依存させない。
    const base = Math.floor(Date.now() / 1_000) - 100;

    const firstTargetText = `nip09 target-first ${nonce}`;
    const firstTarget = await target(firstTargetText, base);
    await expect(
      column.getByTestId("item").filter({ hasText: firstTargetText }),
    ).toHaveCount(1, { timeout: 20_000 });
    await deletion(firstTarget.id, base + 1);
    const firstMarker = `nip09 marker target-first ${nonce}`;
    await marker(firstMarker, base + 2);
    await expect(column).toContainText(firstMarker, { timeout: 20_000 });
    await expect(
      column.getByTestId("item").filter({ hasText: firstTargetText }),
    ).toHaveCount(0);

    const deletionFirstTargetText = `nip09 deletion-first-target ${nonce}`;
    // 対象を署名だけ先に済ませて ID を得ておき、リレーへの到着順を逆にする。
    const deletionFirst = signAsDeletionAuthor({
      kind: 1,
      created_at: base + 4,
      tags: [],
      content: deletionFirstTargetText,
    });
    await deletion(deletionFirst.id, base + 4);
    await publishEvent(deletionFirst);
    const secondMarker = `nip09 marker deletion-first ${nonce}`;
    await marker(secondMarker, base + 6);
    await expect(column).toContainText(secondMarker, { timeout: 20_000 });
    await expect(
      column.getByTestId("item").filter({ hasText: deletionFirstTargetText }),
    ).toHaveCount(0);

    const forgedText = `nip09 forged-deletion ${nonce}`;
    const forgedTarget = await target(forgedText, base + 7);
    await deletion(forgedTarget.id, base + 8, deletionForgedAuthorPubkey);
    const forgedMarker = `nip09 marker forged ${nonce}`;
    await marker(forgedMarker, base + 9);
    await expect(column).toContainText(forgedMarker, { timeout: 20_000 });
    await expect(
      column.getByTestId("item").filter({ hasText: forgedText }),
    ).toHaveCount(1);

    const addressOldText = `nip09 address-old ${nonce}`;
    await publish({
      kind: 30078,
      created_at: base + 10,
      tags: [["d", `nip09/${nonce}`]],
      content: addressOldText,
    });
    await publish({
      kind: 5,
      created_at: base + 11,
      // nostr-rs-relay の旧 NIP-09 検証は e タグを少なくとも 1 本要求する。
      // 対象外の id を併記し、a 座標だけが旧版を隠す条件は維持する。
      tags: [
        ["e", "0".repeat(64)],
        ["a", `30078:${deletionAuthorPubkey}:nip09/${nonce}`],
        ["k", "30078"],
      ],
      content: "",
    });
    const addressNewText = `nip09 address-new ${nonce}`;
    await publish({
      kind: 30078,
      created_at: base + 12,
      tags: [["d", `nip09/${nonce}`]],
      content: addressNewText,
    });
    const addressMarker = `nip09 marker address ${nonce}`;
    await marker(addressMarker, base + 13);
    await expect(column).toContainText(addressMarker, { timeout: 20_000 });
    await expect(
      column.getByTestId("item").filter({ hasText: addressOldText }),
    ).toHaveCount(0);
    await expect(
      column.getByTestId("item").filter({ hasText: addressNewText }),
    ).toHaveCount(1);
  });
});
