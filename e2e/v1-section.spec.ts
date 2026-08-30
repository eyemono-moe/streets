import { expect, test } from "@playwright/test";
import {
  outboxAuthorAPubkey,
  outboxAuthorBPubkey,
  outboxNoteAText,
  outboxNoteBText,
  outboxViewerPubkey,
  relayTwoUrl,
} from "./fixtures/seed-outbox.js";

const debugUrl = `/debug/v1-section?pubkey=${outboxViewerPubkey}`;

test("warms up the routing table from the bootstrap relay", async ({
  page,
}) => {
  await page.goto(debugUrl);

  await expect(page.getByTestId("warmup")).toHaveText(
    "followees: 2 / routed: 2 / unroutable: 0 / unrequested: 0",
    { timeout: 15_000 },
  );
});

test("routes each author to the relay their kind:10002 advertises", async ({
  page,
}) => {
  await page.goto(debugUrl);
  await expect(page.getByTestId("route")).toHaveCount(2, { timeout: 15_000 });

  const routes = await page.getByTestId("route").allTextContents();
  const forA = routes.find((r) =>
    r.startsWith(outboxAuthorAPubkey.slice(0, 8)),
  );
  const forB = routes.find((r) =>
    r.startsWith(outboxAuthorBPubkey.slice(0, 8)),
  );

  expect(forA).toContain("ws://127.0.0.1:8080/");
  expect(forB).toContain(
    relayTwoUrl.endsWith("/") ? relayTwoUrl : `${relayTwoUrl}/`,
  );
});

test("shows notes from both relays, which only routing can achieve", async ({
  page,
}) => {
  await page.goto(debugUrl);

  await expect(page.getByTestId("phase")).toHaveText("phase: settled", {
    timeout: 15_000,
  });
  // 著者 B の投稿はリレー2 にしかない。ルーティングが効いていなければ出ない
  await expect(page.getByTestId("items")).toContainText(outboxNoteAText);
  await expect(page.getByTestId("items")).toContainText(outboxNoteBText);
  await expect(page.getByTestId("unroutable")).toHaveText(
    "unroutableAuthors: 0",
  );
});

test("shows the NIP-11 document of the local relay", async ({ page }) => {
  await page.goto(debugUrl);

  await expect(page.getByTestId("relay-nips")).toHaveText(
    /supported_nips: (\d+,)*1(,\d+)*$/,
    { timeout: 15_000 },
  );
});
