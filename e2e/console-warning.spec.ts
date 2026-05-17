import { expect, test } from "@playwright/test";
import { seededNoteText, setupSeededReadPath } from "./fixtures/seed.js";

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

  await setupSeededReadPath(page);

  await page.goto("/", { waitUntil: "domcontentloaded" });

  await expect(page.getByText(seededNoteText)).toBeVisible({ timeout: 15_000 });
  expect(
    repostWarnings,
    "empty kind:6 repost content from the local seed should not warn repeatedly",
  ).toHaveLength(0);
  expect(consoleErrors, "browser console should not emit errors").toHaveLength(
    0,
  );
});
