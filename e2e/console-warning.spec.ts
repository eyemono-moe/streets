import { expect, test } from "@playwright/test";
import {
  e2eAuthorPubkey,
  e2eViewerPubkey,
  localRelayUrl,
  seededNoteText,
} from "./fixtures/seed.js";

test("renders deterministic local relay seed without repost parser warning flood", async ({
  page,
}) => {
  const repostWarnings: string[] = [];
  const consoleErrors: string[] = [];

  page.on("console", (message) => {
    const text = message.text();
    if (
      message.type() === "warning" &&
      text.includes("failed to parse repost content")
    ) {
      repostWarnings.push(text);
    }
    if (message.type() === "error") {
      consoleErrors.push(text);
    }
  });

  await page.addInitScript(
    ({ authorPubkey, relayUrl, viewerPubkey }) => {
      (window as typeof window & { nostr: unknown }).nostr = {
        getPublicKey: async () => viewerPubkey,
        getRelays: async () => ({
          [relayUrl]: { read: true, write: true },
        }),
        signEvent: async (event: Record<string, unknown>) => ({
          ...event,
          id: "playwright-nip07-mock-event-id",
          pubkey: viewerPubkey,
          sig: "playwright-nip07-mock-signature",
        }),
      };

      window.localStorage.setItem(
        "monostr.relays",
        JSON.stringify({
          version: "0.0",
          defaultRelays: {
            [relayUrl]: { read: true, write: true },
          },
        }),
      );
      window.localStorage.setItem(
        "monostr.deckState",
        JSON.stringify({
          version: 0,
          columns: [
            {
              id: "local-e2e-timeline",
              size: "medium",
              content: { type: "user", pubkey: authorPubkey },
            },
          ],
          display: {
            theme: {
              accent: "#8340bb",
              ui: "#302070",
            },
            showLoading: false,
          },
        }),
      );
    },
    {
      authorPubkey: e2eAuthorPubkey,
      relayUrl: localRelayUrl,
      viewerPubkey: e2eViewerPubkey,
    },
  );

  await page.goto("/");

  await expect(page.getByText(seededNoteText)).toBeVisible({ timeout: 15_000 });
  expect(
    repostWarnings,
    "empty kind:6 repost content from the local seed should not warn repeatedly",
  ).toHaveLength(0);
  expect(consoleErrors, "browser console should not emit errors").toHaveLength(
    0,
  );
});
