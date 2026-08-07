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
 * かつてここには `nostr-login` のバンドルを中断する回避策があった。同ライブラリが
 * `MeProvider` の `onMount` から全ルートで初期化され、ページ読み込みの 1〜2 秒後に
 * `window.nostr` を自分のラッパーへ差し替えるため、スタブした NIP-07 がその後ろに
 * 隠れて `getPublicKey()` が永久に解決しなくなっていた。**そのライブラリを依存ごと
 * 削除した (2026-08-05) ので回避策は不要になり、除去した。**
 */

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

/**
 * 開発者モードを最初から有効にして開くヘルパー (task-5-brief.md Step 4)。
 * `page.addInitScript` で localStorage に永続化キーを直接書く ——
 * developer-mode.ts の `DEVELOPER_MODE_STORAGE_KEY` /
 * `saveDeveloperMode(true)` と同じ文字列をここでハードコードしている。
 * e2e はブラウザ側の別プロセスなので src を import できない (上の
 * `streets.v1.deck.` プレフィックス直書きと同じ理由)。
 */
const enableDeveloperMode = async (page: import("@playwright/test").Page) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("streets.v1.developerMode", "true");
  });
};

test.describe("v1 vertical slice", () => {
  test("login, timeline, coalesced names, posting, and reload all hold together", async ({
    page,
  }) => {
    test.setTimeout(60_000);

    await stubSigner(page);

    await page.goto(`/v1?relays=${previewRelayUrl}`);

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

  /**
   * task-4-brief.md Step 6: 追加・削除・並べ替えの 3 主張を 1 本の流れで
   * 検証する。3 本を独立したテストに分けず 1 本にまとめているのは、
   * ブリーフが挙げる数字 (4 本 → 3 本 → 3 本) がそのまま「追加した状態から
   * 1 本消す」という連続した操作を前提にしているため —— 独立に書くと
   * それぞれ「既定の 3 本から」始まってしまい、ブリーフの数字と合わなく
   * なる。
   *
   * **リロード後の確認を必ず入れる (ブリーフの要求)。** 画面上で変わる
   * ことと、その変更が保存されていることは別の主張であり、後者だけが
   * `updateDeck` (v1.tsx) を通ったことの証拠になる —— 操作直後の
   * アサーションだけでは、Solid のシグナルは更新したが localStorage への
   * 書き込みを忘れた、という壊れ方を見逃す。
   */
  test("adding, removing, and reordering deck columns survive reload", async ({
    page,
  }) => {
    test.setTimeout(60_000);

    await stubSigner(page);
    await page.goto(`/v1?relays=${previewRelayUrl}`);

    await page.getByTestId("login").click();
    await expect(page.getByTestId("viewer-pubkey")).toHaveText(
      previewViewerPubkey,
      { timeout: 15_000 },
    );

    const columns = page.getByTestId("deck-column");
    await expect(columns).toHaveCount(3);

    // 1. カラムを追加 → deck-column が 4 本 → リロード → まだ 4 本
    //
    // "global" 種別を選ぶのは、"user"/"hashtag" と違って入力欄が要らず
    // (column-presets.ts の NEEDS_INPUT)、buildColumn が常に成功するため。
    // 種別ごとの正しさ (どの入力がどの ColumnSource になるか) は
    // column-presets.test.ts が既に固定しているので、ここでは「追加した
    // 結果が保存を経由してもデッキに残る」という配線だけを確かめる。
    await page.getByTestId("add-column").click();
    await expect(page.getByTestId("add-column-form")).toBeVisible();
    await page.getByTestId("add-column-kind-global").click();
    await page.getByTestId("add-column-submit").click();
    await expect(columns).toHaveCount(4);

    await page.reload();
    await page.getByTestId("login").click();
    await expect(page.getByTestId("viewer-pubkey")).toHaveText(
      previewViewerPubkey,
      { timeout: 15_000 },
    );
    await expect(columns).toHaveCount(4);

    // 2. カラムを削除 → 3 本 → リロード → まだ 3 本
    await columns.first().getByTestId("column-remove").click();
    await expect(columns).toHaveCount(3);

    await page.reload();
    await page.getByTestId("login").click();
    await expect(page.getByTestId("viewer-pubkey")).toHaveText(
      previewViewerPubkey,
      { timeout: 15_000 },
    );
    await expect(columns).toHaveCount(3);

    // 3. 先頭のカラムを右へ → 順序が入れ替わる → リロード → 入れ替わったまま
    //
    // id と個数だけでは「並び替わった」ことを主張できない (final review,
    // Important 4 と同じ理由 —— defaultDeck も loadDeck の復元も同じ 3 つの
    // id 集合を返しうる)。並び替え前後で 1 番目・2 番目の data-column-id を
    // 直接比較することで、「同じ集合のまま順序だけが変わった」ことを
    // 主張する。
    const firstIdBefore = await columns.first().getAttribute("data-column-id");
    const secondIdBefore = await columns.nth(1).getAttribute("data-column-id");
    if (!firstIdBefore || !secondIdBefore) {
      throw new Error("expected the first two deck columns to have ids");
    }

    await columns.first().getByTestId("column-move-right").click();
    await expect(columns.first()).toHaveAttribute(
      "data-column-id",
      secondIdBefore,
    );
    await expect(columns.nth(1)).toHaveAttribute(
      "data-column-id",
      firstIdBefore,
    );

    await page.reload();
    await page.getByTestId("login").click();
    await expect(page.getByTestId("viewer-pubkey")).toHaveText(
      previewViewerPubkey,
      { timeout: 15_000 },
    );
    await expect(columns.first()).toHaveAttribute(
      "data-column-id",
      secondIdBefore,
    );
    await expect(columns.nth(1)).toHaveAttribute(
      "data-column-id",
      firstIdBefore,
    );
  });

  /**
   * task-5-brief.md Step 4 の主張 1・2: 開発者モードは既定で無効で、
   * 診断値 (`connections` / `deck-column-phase`) は DOM に存在しない。
   * トグルを押すと現れる。
   *
   * `deck-column-incomplete` は `task-5-brief.md` が挙げる 3 つ目の
   * data-testid だが、この spec のフィクスチャ (seed-preview.ts) は閲覧者と
   * フォロー相手 2 人ぶんの kind:10002 を single relay 構成で用意しており、
   * `unreachableRelays`/`unroutableAuthors`/`uncoveredAuthors` がどれも 0 の
   * まま (`status.incomplete` 自体が生成されない、section-reader.ts の
   * `get status()` 参照) —— 開発者モードの有無に関わらずこの環境では
   * そもそも描画されない。ここでは実際に描画される 2 つ (`connections` /
   * `deck-column-phase`) だけで gate を主張し、`deck-column-incomplete` は
   * 「存在しないこと」自体は既定状態のアサーションに含めるが、トグル後に
   * 「現れること」は主張しない (この環境では現れないのが正しい挙動であり、
   * 現れることを主張すると常に落ちるテストになる)。
   */
  test("developer mode gates diagnostics behind a toggle", async ({ page }) => {
    test.setTimeout(60_000);

    await stubSigner(page);
    await page.goto(`/v1?relays=${previewRelayUrl}`);

    await page.getByTestId("login").click();
    await expect(page.getByTestId("viewer-pubkey")).toHaveText(
      previewViewerPubkey,
      { timeout: 15_000 },
    );

    // 1. 既定 (無効) では診断値が DOM に存在しない。
    // 捕まえる変異: developerMode の既定を true にする、または
    // DiagnosticsPanel の visible 条件を反転させる。
    await expect(page.getByTestId("connections")).toHaveCount(0);
    await expect(page.getByTestId("deck-column-phase")).toHaveCount(0);
    await expect(page.getByTestId("deck-column-incomplete")).toHaveCount(0);

    // 2. トグルを押すと現れる。
    // 捕まえる変異: トグルが developerMode シグナルを更新しない
    // (localStorage への書き込みだけで signal を setDeveloperMode しない)、
    // または DiagnosticsPanel が developerMode の変化に反応しない。
    await page.getByTestId("developer-mode-toggle").click();
    await expect(page.getByTestId("connections")).toBeVisible();
    await expect(page.getByTestId("deck-column-phase").first()).toBeVisible();
    // 3 カラムぶん出ること (DeckColumn ごとに DiagnosticsPanel が独立して
    // developerMode を見ている、が確かめられる)
    await expect(page.getByTestId("deck-column-phase")).toHaveCount(3);
  });

  /**
   * task-5-brief.md Step 4 の主張 3: リロードしても開発者モードは有効なまま。
   * `enableDeveloperMode` (`page.addInitScript`) で最初から有効な状態を
   * 作ってから開き、リロードを挟んでも診断値が出続けることを確かめる ——
   * トグル UI を経由しない経路 (直接 localStorage に書かれていた値) からの
   * 読み込みも同じ結果になることを、上のトグル操作のテストとは独立に
   * 確認する。
   */
  test("developer mode enabled via localStorage survives reload", async ({
    page,
  }) => {
    test.setTimeout(60_000);

    await stubSigner(page);
    await enableDeveloperMode(page);
    await page.goto(`/v1?relays=${previewRelayUrl}`);

    await page.getByTestId("login").click();
    await expect(page.getByTestId("viewer-pubkey")).toHaveText(
      previewViewerPubkey,
      { timeout: 15_000 },
    );

    // 開いた時点で既に有効 (トグルを押していない)
    await expect(page.getByTestId("connections")).toBeVisible();
    await expect(page.getByTestId("deck-column-phase").first()).toBeVisible();

    // 捕まえる変異: developerMode の初期値が loadDeveloperMode の結果を
    // 使わず、常に false から始める (トグル操作なしでは絶対に有効になら
    // ない、という壊れ方)
    await page.reload();
    await page.getByTestId("login").click();
    await expect(page.getByTestId("viewer-pubkey")).toHaveText(
      previewViewerPubkey,
      { timeout: 15_000 },
    );
    await expect(page.getByTestId("connections")).toBeVisible();
    await expect(page.getByTestId("deck-column-phase").first()).toBeVisible();
  });
});
