import { type WebSocketRoute, expect, test } from "@playwright/test";
import {
  outboxNoteBText,
  outboxViewerPubkey,
  publishNoteAsAuthorB,
  relayTwoUrl,
} from "./fixtures/seed-outbox.js";

/**
 * リレー2 の切断は `page.routeWebSocket` で**ブラウザ側だけ**に起こす。
 *
 * 初版は `docker compose stop/start nostr-rs-relay-2` でコンテナごと
 * 落としていたが、これは二つの理由で捨てた。
 *
 * 1. **他の spec を巻き添えにしていた。** `docker compose start` はホストの
 *    ブリッジネットワークを再構成する。Chromium はこれをネットワーク変更と
 *    して検知し、in-flight のリクエストを丸ごと `net::ERR_NETWORK_CHANGED`
 *    で中断する — 落ちるのはリレーへの WebSocket だけではなく、直列実行で
 *    次に走る spec が `page.goto()` で取りに行く `http://127.0.0.1:4173` の
 *    **アプリ自身の JS モジュール**も含まれる。実際 v1-section.spec.ts が
 *    「要素が見つからない」で落ちていた原因はこれで、単独実行では再現せず、
 *    この spec の後ろに並んだときだけ落ちていた。テストが自分のプロセス外の
 *    グローバルな状態 (ホストのネットワークスタック) を触っていたということ
 *    であり、隔離できない類の欠陥である。
 * 2. **本当に測りたいものを測れていなかった。** コンテナが停止していると
 *    リレーの DB ごと止まるので、「切断中に他所から届いた投稿を、復帰後の
 *    再購読で拾えるか」を確かめようがない。旧版の復帰後の主張は
 *    `toContainText(outboxNoteBText)` — 切断前から表示されていて `EventStore`
 *    が保持し続けている文字列であり、再購読が一切動かなくても通る自明な
 *    主張だった。
 *
 * ルーティングならリレーのプロセスは生きたままなので、テスト側 (Node) は
 * 直接繋いで発行でき、ページ側にだけ「繋がらない」を見せられる。
 */
const relayTwoHost = new URL(relayTwoUrl).host;

test.describe("relay recovery", () => {
  test("recovers a relay that went away and came back", async ({ page }) => {
    test.setTimeout(120_000);

    // ページから見たリレー2 が生きているか。ルートハンドラは接続のたびに
    // 呼ばれるので、再接続の試行はそのつどこのフラグを読み直す。
    let reachable = true;
    // 今 Playwright が中継している接続。`reachable` を倒すときに、既に
    // 開いているソケットも殺す必要がある — 新規接続を拒むだけでは、
    // アプリは繋がったままの既存ソケットを持ち続けて切断に気づかない。
    const live = new Set<WebSocketRoute>();

    await page.routeWebSocket(
      (url) => url.host === relayTwoHost,
      (ws) => {
        if (!reachable) {
          // `connectToServer()` を呼ばずに閉じる = ページから見ると
          // 「開いた直後に切られた」。アプリはこれを接続の死として扱い
          // (`WebSocketRelayConnection.fail()`)、EOSE は来ないので
          // unreachable は立ったままになる。
          ws.close();
          return;
        }
        live.add(ws);
        ws.onClose(() => live.delete(ws));
        // 素通し。`onMessage` を張らなければ Playwright が双方向に中継する。
        ws.connectToServer();
      },
    );

    await page.goto(`/debug/v1-section?pubkey=${outboxViewerPubkey}`);
    const items = page.getByTestId("items");
    const unreachable = page.getByTestId("unreachable");

    // 著者 B の投稿はリレー2 にしか無い = ここに出た時点でルーティングが効いている
    await expect(items).toContainText(outboxNoteBText, { timeout: 15_000 });
    await expect(unreachable).toHaveText("unreachableRelays: 0");

    // --- 切断 ---
    reachable = false;
    for (const ws of [...live]) ws.close();
    await expect(unreachable).toHaveText("unreachableRelays: 1", {
      timeout: 30_000,
    });

    // 切断されているのはブラウザだけで、リレー本体は生きている。ここで
    // 発行した投稿は、復帰後に REQ を張り直して初めて取得できる。内容は
    // 実行ごとに変える (リレーの DB は永続する — fixture のコメント参照)。
    const lateNoteText = `outbox author B note published while down ${Date.now()}`;
    await publishNoteAsAuthorB(lateNoteText);
    // まだ見えないこと。ここが通らなければ以降の主張は無意味になる。
    await expect(items).not.toContainText(lateNoteText);

    // --- 復帰 ---
    reachable = true;
    // 初回 1 秒からの指数バックオフ + ジッタ。上限 60 秒 (ADR-0021)。
    await expect(unreachable).toHaveText("unreachableRelays: 0", {
      timeout: 90_000,
    });
    // 本題: 元のフィルタをそのまま張り直したので、切断中の投稿が拾えている。
    await expect(items).toContainText(lateNoteText, { timeout: 30_000 });
    await expect(items).toContainText(outboxNoteBText);
  });
});
