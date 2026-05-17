import { expect, test } from "@playwright/test";
import {
  e2eAuthorDisplayName,
  e2eAuthorName,
  e2eAuthorPubkey,
  e2eFollowerDisplayName,
  e2eFollowerName,
  seededNoteText,
  setupSeededReadPath,
} from "./fixtures/seed.js";

test("renders seeded author timeline and metadata from the local relay", async ({
  page,
}) => {
  await setupSeededReadPath(page);

  await page.goto("/");

  await expect(page.getByText(seededNoteText)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(e2eAuthorDisplayName).first()).toBeVisible();
  await expect(page.getByText(`@${e2eAuthorName}`).first()).toBeVisible();
});

test("renders seeded follower list through contact-list reads", async ({
  page,
}) => {
  await setupSeededReadPath(page, {
    columns: [
      {
        id: "local-e2e-followers",
        size: "medium",
        content: { type: "followers", pubkey: e2eAuthorPubkey },
      },
    ],
  });

  await page.goto("/");

  await expect(page.getByText(e2eFollowerDisplayName).first()).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByText(`@${e2eFollowerName}`).first()).toBeVisible();
});
