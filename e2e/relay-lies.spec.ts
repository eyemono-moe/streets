import { type WebSocketRoute, expect, test } from "@playwright/test";
import {
  intruderNoteText,
  makeIntruderNote,
  outboxNoteBText,
  outboxViewerPubkey,
  relayTwoUrl,
} from "./fixtures/seed-outbox.js";

/**
 * 悪意あるリレーを本物として再現する唯一の手段。
 *
 * 実リレー (nostr-rs-relay) はフィルタを守るので、「要求していないイベントを
 * 送りつけてくる」を実物では再現できない。`page.routeWebSocket` でページと
 * リレーの間に立ち、クライアントの REQ から `subscription_id` を拾って、
 * その購読宛に余計な EVENT を注入する —— NIP-01 の EVENT は
 * `subscription_id` しか持たないので、これは実在のリレーができることの
 * 正確な再現である。
 */
const relayTwoHost = new URL(relayTwoUrl).host;

test("drops events the section never asked for", async ({ page }) => {
  test.setTimeout(60_000);

  const intruder = makeIntruderNote();
  let injected = 0;

  await page.routeWebSocket(
    (url) => url.host === relayTwoHost,
    (ws: WebSocketRoute) => {
      const server = ws.connectToServer();
      // onMessage を張ると自動中継が止まるので、両方向を明示的に転送する。
      ws.onMessage((message) => {
        server.send(message);
        try {
          const parsed = JSON.parse(String(message));
          if (
            Array.isArray(parsed) &&
            parsed[0] === "REQ" &&
            typeof parsed[1] === "string"
          ) {
            ws.send(JSON.stringify(["EVENT", parsed[1], intruder]));
            injected += 1;
          }
        } catch {
          // JSON でないフレームは素通しでよい
        }
      });
      server.onMessage((message) => ws.send(message));
    },
  );

  await page.goto(`/debug/v1-section?pubkey=${outboxViewerPubkey}`);
  const items = page.getByTestId("items");

  // 著者 B の投稿はリレー2 にしかない。出た時点で、注入も済んでいる。
  await expect(items).toContainText(outboxNoteBText, { timeout: 20_000 });
  expect(injected, "the route never saw a REQ to inject into").toBeGreaterThan(
    0,
  );

  // 主張 1: 迷い込みノートは出ない
  await expect(items).not.toContainText(intruderNoteText);

  // 主張 2: 捨てたことが観測できる。schnorr 拒否ではカウンタは増えないので、
  // この主張が「照合器が捨てた」ことと「署名検証が捨てた」ことを区別する。
  await expect(page.getByTestId("unrequested-relays")).toContainText(
    relayTwoUrl,
  );
  await expect(page.getByTestId("unrequested")).toHaveText(
    /^unrequested: [1-9]\d*$/,
  );

  // 主張 3: リレー2 を壊しただけではない
  await expect(items).toContainText(outboxNoteBText);
});
