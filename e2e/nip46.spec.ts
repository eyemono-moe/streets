import { expect, test } from "@playwright/test";
import {
  nip46RelayUrl,
  nip46UserPubkey,
  startNip46Signer,
} from "./fixtures/nip46-signer.js";

test("bunkerログイン、投稿、復元、ログアウトを1本通す", async ({ page }) => {
  const remote = await startNip46Signer();
  try {
    await page.goto(`/v1?relays=${encodeURIComponent(nip46RelayUrl)}`);
    await page.getByTestId("bunker-uri").fill(remote.bunkerUri);
    await page.getByTestId("bunker-login").click();
    await expect(page.getByTestId("viewer-pubkey")).toHaveText(nip46UserPubkey);
    expect((await remote.connectPermissions).split(",")).toEqual([
      "sign_event:1",
      "sign_event:10000",
      "nip44_encrypt",
      "nip44_decrypt",
      "nip04_decrypt",
    ]);

    const first = `nip46 first ${Date.now()}`;
    await page.getByTestId("composer-input").fill(first);
    await page.getByTestId("composer-submit").click();
    await expect(page.getByText(first, { exact: true }).first()).toBeVisible();

    await page.reload();
    await expect(page.getByTestId("viewer-pubkey")).toHaveText(nip46UserPubkey);
    const second = `nip46 restored ${Date.now()}`;
    await page.getByTestId("composer-input").fill(second);
    await page.getByTestId("composer-submit").click();
    await expect(page.getByText(second, { exact: true }).first()).toBeVisible();

    await page.getByTestId("logout").click();
    await expect(page.getByTestId("bunker-login")).toBeVisible();
    await page.reload();
    await expect(page.getByTestId("bunker-login")).toBeVisible();
    await expect(page.getByTestId("viewer-pubkey")).toHaveCount(0);
  } finally {
    remote.close();
  }
});
