import { expect, test } from "@playwright/test";
import type { EventTemplate } from "nostr-tools";
import {
  previewAuthorOneDisplayName,
  previewAuthorOneNoteText,
  previewAuthorTwoNoteText,
  previewRelayUrl,
  previewViewerPubkey,
  previewViewerSeedNoteText,
  signAsPreviewViewer,
} from "./fixtures/seed-preview.js";

/**
 * 縦断 e2e (task-7-brief.md Step 2): ログイン → カラム表示 → 投稿 →
 * リロード復元を 1 本の流れで主張する。ここが仕様 10 節の答えを裏づける
 * 唯一の実測経路であり、以後の回帰はこの spec が拾う。
 *
 * **`nostr-login` のバンドルを止める、恒久的な回避策 (削除できるとき: 下記)。**
 * `App.tsx` は全ルート (`/v1-preview` も含む) を `MeProvider` で包んでおり、
 * `src/context/me.tsx` の `onMount` が `nostr-login` を無条件に `import()` する。
 * このライブラリはページ読み込みからおよそ 1〜2 秒後に `window.nostr` を
 * 自分のモーダル経由のラッパーへ差し替える —— スタブした NIP-07 はこの
 * ラッパーの後ろに隠れ、`getPublicKey()` がモーダルのクリックを待って
 * 永久に解決しなくなる。Task 1/5 が throwaway スクリプトでこの回避策を
 * 検証済み (task-1-report.md「Important finding」、task-5-report.md
 * 「Gotchas」)。このファイルではその回避策を恒久化する —— `nostr-login` の
 * チャンクへのリクエストを丸ごと中断し、`window.nostr` をこのスタブだけが
 * 占有する状態にする。**消せるとき**: `/v1-preview` (または v1 全体) が
 * `MeProvider` の外に出るか、`MeProvider` 自身が v1 側の signer 実装に
 * 統合されたとき。`MeProvider`/`App.tsx` はこのタスクの変更対象外 (旧実装
 * に属する) なので、ここでは触らずページ単位で無効化する。
 */
const blockNostrLogin = async (page: import("@playwright/test").Page) => {
  await page.route(/nostr-login/, (route) => route.abort());
};

/**
 * `window.nostr` のスタブ。`e2e/console-warning.spec.ts` と同じ
 * `page.addInitScript` の手法だが、`signEvent` は固定のダミー署名では
 * なく `page.exposeFunction` 経由で Node 側の本物の schnorr 署名
 * (`signAsPreviewViewer`, `@noble/curves` 上に構築された
 * `nostr-tools/pure` の `finalizeEvent`) を呼ぶ。**理由**: 主張 4
 * (投稿が自分のカラムに出る) は `EventStore.put` の schnorr 検証を
 * 経由する楽観挿入を通るので、モックの sig では素通りしない。
 */
const stubSigner = async (page: import("@playwright/test").Page) => {
  await page.exposeFunction(
    "__streetsSignAsPreviewViewer",
    (template: EventTemplate) => signAsPreviewViewer(template),
  );
  await page.addInitScript((viewerPubkey: string) => {
    const win = window as typeof window & {
      nostr: {
        getPublicKey(): Promise<string>;
        signEvent(template: unknown): Promise<unknown>;
      };
      __streetsSignAsPreviewViewer(template: unknown): Promise<unknown>;
    };
    win.nostr = {
      getPublicKey: async () => viewerPubkey,
      signEvent: async (template: unknown) =>
        win.__streetsSignAsPreviewViewer(template),
    };
  }, previewViewerPubkey);
};

test.describe("v1 vertical slice", () => {
  test("login, timeline, coalesced names, posting, and reload all hold together", async ({
    page,
  }) => {
    test.setTimeout(60_000);

    await blockNostrLogin(page);
    await stubSigner(page);

    await page.goto(`/v1-preview?relays=${previewRelayUrl}`);

    // 1. ログインすると自分の pubkey が出る
    await page.getByTestId("login").click();
    await expect(page.getByTestId("viewer-pubkey")).toHaveText(
      previewViewerPubkey,
      { timeout: 15_000 },
    );

    const homeColumn = page.locator(
      '[data-testid="deck-column"][data-column-id="home"]',
    );
    const mineColumn = page.locator(
      '[data-testid="deck-column"][data-column-id="mine"]',
    );

    // 2. カラムにフォロー相手の kind:1 が出る (home = Outbox ルーティング)
    await expect(homeColumn).toContainText(previewAuthorOneNoteText, {
      timeout: 20_000,
    });
    await expect(homeColumn).toContainText(previewAuthorTwoNoteText);

    // 3. 名前が出る (短縮 pubkey ではない = コアレッサが動いている)。
    // 短縮 pubkey は `${8文字}…` の形なので、その形になっていないことも
    // 合わせて確かめる — 「たまたま表示された何らかの文字列」ではなく
    // 「短縮表示から実名表示へ切り替わった」ことを主張する。
    const authorOneName = homeColumn
      .locator('[data-testid="note"]', { hasText: previewAuthorOneNoteText })
      .getByTestId("profile-name");
    await expect(authorOneName).toHaveText(previewAuthorOneDisplayName, {
      timeout: 20_000,
    });
    await expect(authorOneName).not.toHaveText(/^[0-9a-f]{8}…$/);

    // mine 列に、フィクスチャが用意した自分の既存ノートが出ていること
    // (投稿フォームでの新規投稿と混同しないための前提確認)
    await expect(mineColumn).toContainText(previewViewerSeedNoteText, {
      timeout: 20_000,
    });

    // 4. 投稿すると自分のカラムに出る (楽観的挿入 — リレー往復を待たない)
    const postText = `streets vertical slice live post ${Date.now()}`;
    await page.getByTestId("composer-input").fill(postText);
    await page.getByTestId("composer-submit").click();
    await expect(mineColumn).toContainText(postText, { timeout: 5_000 });

    // publish がプールを通って実際にこのリレーへ届いたことも確認する
    // (仕様 6 節: publish は 30 接続予算の中の同じ ConnectionPool を通る)。
    // 表示される URL は relay-url.ts の正規化でパスの trailing slash が
    // 付くことがある (task-6-report.md の実測 "ws://127.0.0.1:8080/") ので、
    // 完全一致ではなくホスト部分の含有で確かめる。
    const publishResult = page.getByTestId("publish-result");
    await expect(publishResult).toContainText("accepted=1", {
      timeout: 15_000,
    });
    await expect(publishResult).toContainText(new URL(previewRelayUrl).host);
    await expect(publishResult).toContainText("rejected=0");

    // 5. リロードしても 3 カラムが残る
    //
    // **これだけでは判定として空虚 (final review, Important 4)。**
    // `defaultDeck()` も常に home/mine/global の 3 本を返すので、id と個数
    // だけでは「保存済みを復元した」のか「保存が無かったので毎回作り直した」
    // のかを区別できない。実際、レビューで `loadDeck(...)` 呼び出しを
    // `undefined` に丸ごと置き換え (= 永続化を全部消す) てもこのアサーション
    // だけは素通りした。保存済みのカラムのタイトルを reload の前に直接
    // 書き換え、それが reload 後も残っていることまで確かめて初めて
    // 「作り直しではなく復元した」と主張できる —— 作り直しなら
    // `defaultDeck()` の固定タイトル (「ホーム」) に戻ってしまう。
    const mutatedHomeTitle = `mutated home title ${Date.now()}`;
    await page.evaluate(
      ({ pubkey, mutatedTitle }) => {
        // deck.ts の `deckStorageKey()` はキーの実装詳細だが、e2e はブラウザ
        // 側の別プロセスなので import できない —— 接頭辞一致で探すことで、
        // 完全一致がプレフィックスの正確な区切り文字まで knowledge として
        // 要求しないようにする。
        const key = Object.keys(window.localStorage).find((k) =>
          k.startsWith(`streets.v1.deck.${pubkey}`),
        );
        if (!key) {
          throw new Error(
            `no persisted deck found in localStorage for pubkey ${pubkey}`,
          );
        }
        const raw = window.localStorage.getItem(key);
        if (!raw) throw new Error(`persisted deck key ${key} had no value`);
        const deck = JSON.parse(raw) as { columns: { title: string }[] };
        deck.columns[0].title = mutatedTitle;
        window.localStorage.setItem(key, JSON.stringify(deck));
      },
      { pubkey: previewViewerPubkey, mutatedTitle: mutatedHomeTitle },
    );

    await page.reload();
    // ログインセッション自体は永続しない (デッキだけが localStorage に残る)
    // ので、再ログインしてから確認する — Task 3 の verification と同じ前提。
    await page.getByTestId("login").click();
    await expect(page.getByTestId("viewer-pubkey")).toHaveText(
      previewViewerPubkey,
      { timeout: 15_000 },
    );

    const columnsAfterReload = page.getByTestId("deck-column");
    await expect(columnsAfterReload).toHaveCount(3);
    await expect(
      page.locator('[data-testid="deck-column"][data-column-id="home"]'),
    ).toBeVisible();
    await expect(
      page.locator('[data-testid="deck-column"][data-column-id="mine"]'),
    ).toBeVisible();
    await expect(
      page.locator('[data-testid="deck-column"][data-column-id="global"]'),
    ).toBeVisible();

    // home 列のタイトルが、直前に書き換えた文字列のまま残っている ——
    // `defaultDeck()` で作り直していたら固定タイトル「ホーム」に戻る。
    await expect(
      page
        .locator('[data-testid="deck-column"][data-column-id="home"]')
        .getByTestId("deck-column-title"),
    ).toHaveText(mutatedHomeTitle);

    // 直前に投稿した内容も再取得後の mine 列に残っている (リレーへ実際に
    // 届いていたことの、リロード越しの追認)
    await expect(
      page.locator('[data-testid="deck-column"][data-column-id="mine"]'),
    ).toContainText(postText, { timeout: 20_000 });
  });
});
