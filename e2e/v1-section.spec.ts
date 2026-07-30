import { expect, test } from "@playwright/test";
import { seededNoteText } from "./fixtures/seed";

test("renders seeded notes from the local relay", async ({ page }) => {
  await page.goto("/debug/v1-section");

  await expect(page.getByTestId("phase")).toHaveText("phase: settled", {
    timeout: 15_000,
  });
  await expect(page.getByTestId("unreachable")).toHaveText(
    "unreachableRelays: 0",
  );
  await expect(page.getByTestId("item").first()).toBeVisible();
  await expect(page.getByTestId("items")).toContainText(seededNoteText);
});

test("lists newest events first", async ({ page }) => {
  await page.goto("/debug/v1-section");
  await expect(page.getByTestId("phase")).toHaveText("phase: settled", {
    timeout: 15_000,
  });

  const timestamps = await page
    .getByTestId("item")
    .allTextContents()
    .then((texts) => texts.map((t) => Number(t.split(" / ")[0])));

  expect(timestamps.length).toBeGreaterThan(1);
  expect(timestamps).toEqual([...timestamps].sort((a, b) => b - a));
});

test("shows the NIP-11 document of the local relay", async ({ page }) => {
  await page.goto("/debug/v1-section");

  await expect(page.getByTestId("relay-nips")).toContainText("1", {
    timeout: 15_000,
  });
});
