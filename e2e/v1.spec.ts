import { expect, test } from "@playwright/test";
import type { EventTemplate } from "nostr-tools";
import {
  previewAuthorOneDisplayName,
  previewAuthorOneNoteText,
  previewAuthorOnePubkey,
  previewAuthorTwoNoteText,
  previewAuthorTwoPubkey,
  previewQuoteNoteText,
  previewQuoteTargetNoteText,
  previewRelayUrl,
  previewReplyNoteText,
  previewReplyParentNoteText,
  previewRepostTargetNoteText,
  previewUnknownKindNoteText,
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

/**
 * task-5-brief.md Step 2/3 用のカラムを、ログイン前に localStorage へ直接
 * 仕込む。`column-presets.ts` の 4 種別 (home/user/hashtag/global) は
 * どれも `kinds: [1]` 固定で、UI からは kind:6/16 や未登録 kind (30023)
 * を購読するカラムを作れない —— そのため `deck.ts` の永続化フォーマット
 * (`loadDeck` が読む JSON の形) へ直接書き込む。上の
 * `mutatedHomeTitle` の書き換え (縦断 e2e) と同じ「e2e はブラウザ側の
 * 別プロセスなので import できず、キーの文字列とスキーマの形をここへ
 * 直書きする」手法。
 *
 * `authors` を閲覧者と著者 2 人に絞るのは、ローカルリレーには他の spec の
 * フィクスチャも大量の kind:1 を発行しており、絞らないと無関係なノイズが
 * 混ざって「対象の本文が出ている」ことの主張が読みにくくなるため。
 */
const seedRelatedEventsDeck = async (page: import("@playwright/test").Page) => {
  await page.addInitScript(
    ({ pubkey, relay, authors }) => {
      const deck = {
        version: 2,
        columns: [
          {
            id: "related",
            title: "related",
            source: {
              kind: "literal",
              filters: [{ kinds: [1, 6, 16, 30023], authors }],
              relays: [relay],
            },
          },
        ],
      };
      window.localStorage.setItem(
        `streets.v1.deck.${pubkey}`,
        JSON.stringify(deck),
      );
    },
    {
      pubkey: previewViewerPubkey,
      relay: previewRelayUrl,
      authors: [
        previewViewerPubkey,
        previewAuthorOnePubkey,
        previewAuthorTwoPubkey,
      ],
    },
  );
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

    // 3. 名前が出る (短縮 npub ではない = コアレッサが動いている)。
    // 未取得のときは npub の先頭 12 文字なので、その形になっていないことも
    // 合わせて確かめる — 「たまたま表示された何らかの文字列」ではなく
    // 「短縮表示から実名表示へ切り替わった」ことを主張する。
    const authorOneName = homeColumn
      .locator('[data-testid="note"]', { hasText: previewAuthorOneNoteText })
      .getByTestId("profile-name");
    await expect(authorOneName).toHaveText(previewAuthorOneDisplayName, {
      timeout: 20_000,
    });
    await expect(authorOneName).not.toHaveText(/^npub1/);

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
    await expect(page.getByTestId("deck-column-first-render-ms")).toHaveCount(
      0,
    );
    await expect(page.getByTestId("deck-column-incomplete")).toHaveCount(0);
    await expect(page.getByTestId("event-batch")).toHaveCount(0);
    await expect(page.getByTestId("profile-batch")).toHaveCount(0);
    await expect(page.getByTestId("warm-up-ms")).toHaveCount(0);
    await expect(page.getByTestId("warm-up-phases")).toHaveCount(0);
    await expect(page.getByTestId("verify-ms")).toHaveCount(0);

    // 2. トグルを押すと現れる。
    // 捕まえる変異: トグルが developerMode シグナルを更新しない
    // (localStorage への書き込みだけで signal を setDeveloperMode しない)、
    // または DiagnosticsPanel が developerMode の変化に反応しない。
    await page.getByTestId("developer-mode-toggle").click();
    await expect(page.getByTestId("connections")).toBeVisible();
    // 捕まえる変異: バッチ件数を DiagnosticsPanel の外に置く
    // (診断値なのに常時見えてしまう) / 配線を忘れる。
    await expect(page.getByTestId("event-batch")).toBeVisible();
    await expect(page.getByTestId("profile-batch")).toBeVisible();
    await expect(page.getByTestId("warm-up-ms")).toBeVisible();
    await expect(page.getByTestId("warm-up-phases")).toBeVisible();
    await expect(page.getByTestId("verify-ms")).toBeVisible();
    // 捕まえる変異: warmUpMs を resolve 後にしか set しない (失敗時に
    // 空のまま残り、初回描画のうちブートストラップが占める分が読めない) /
    // verifyMs を store から取らず 0 固定にする。
    await expect(page.getByTestId("warm-up-ms")).not.toHaveText(/warmUpMs: -/);
    // 捕まえる変異: phase1Ms/phase2Ms を計測せず未確定のまま残す
    // (仕様 11 節の前提 —— 相② が支配的かどうか —— を検証する材料が
    // 出ない)。
    await expect(page.getByTestId("warm-up-phases")).not.toHaveText(
      /phase1: - \/ phase2: -/,
    );
    await expect(page.getByTestId("verify-ms")).not.toHaveText(
      /verifyMs: 0\.00 \(0 件\)/,
    );
    // プロフィールは必ず要求される (どのノートにも著者がいる) ので、
    // 0 のままなら計測が繋がっていない。
    await expect(page.getByTestId("profile-batch")).not.toHaveText(
      /profileBatch: 0 \(max 0\)/,
    );
    await expect(page.getByTestId("deck-column-phase").first()).toBeVisible();
    // 捕まえる変異: カラム単位ではなくデッキ全体で 1 つだけ記録する。
    // ウォームアップを待たないカラムの値が代表になり、ユーザーが実際に
    // 待っているカラムが予算外でも予算内に見える。
    await expect(page.getByTestId("deck-column-first-render-ms")).toHaveCount(
      3,
    );
    // 3 カラムぶん出ること (DeckColumn ごとに DiagnosticsPanel が独立して
    // developerMode を見ている、が確かめられる)
    await expect(page.getByTestId("deck-column-phase")).toHaveCount(3);

    // 3. first-render-ms (task-5-brief.md Step 1) が、いずれかのカラムに
    // 最初のノートが描画された後は "-" ではなく数値になる。「初回だけ記録
    // する」の判定そのもの (first-render-recorder.test.ts) はブラウザ無しで
    // 固定済み —— ここでは DeckColumn → v1.tsx の配線 (onHasItems が実際に
    // 呼ばれ、firstRenderMs が DOM に反映される) が生きていることだけを
    // 確かめる。
    // 捕まえる変異: v1.tsx が onHasItems を DeckColumn へ渡し忘れる、
    // DeckColumn 側の createEffect が items().length を見ない、または
    // recordFirstRender の戻り値を firstRenderMs へ反映し忘れる。
    const homeColumn = page.locator(
      '[data-testid="deck-column"][data-column-id="home"]',
    );
    await expect(homeColumn).toContainText(previewAuthorOneNoteText, {
      timeout: 20_000,
    });
    await expect(page.getByTestId("first-render-ms")).not.toHaveText(
      "firstRenderMs: -",
    );
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

  /**
   * task-5-brief.md Step 3: リポスト/引用/返信/未登録 kind を 1 本の流れで
   * 確かめる。`seedRelatedEventsDeck` で用意した "related" 列 (kinds:
   * [1, 6, 16, 30023]) を開き、`EventView` の登録レンダラ経路と fallback
   * 経路の両方を通す。
   */
  test("reposts, quotes, and replies render through EventView; an unknown kind falls back without breaking the column", async ({
    page,
  }) => {
    test.setTimeout(60_000);

    await stubSigner(page);
    await seedRelatedEventsDeck(page);
    await page.goto(`/v1?relays=${previewRelayUrl}`);

    await page.getByTestId("login").click();
    await expect(page.getByTestId("viewer-pubkey")).toHaveText(
      previewViewerPubkey,
      { timeout: 15_000 },
    );

    const related = page.locator(
      '[data-testid="deck-column"][data-column-id="related"]',
    );
    await expect(related).toBeVisible();

    // このフィクスチャの対象ノート (repostTargetNote/quoteTargetNote/
    // replyParentNote) は、それ自体も authorOne/authorTwo の通常の kind:1
    // として "related" 列のフィルタ (kinds:[1,6,16,30023]) に独立してヒット
    // する。そのため `related` 列全体に対する `toContainText` では、対象の
    // 本文が「リポスト/引用/返信の内側 (compact) に埋め込まれて出ている」
    // ことと「たまたま同じ文面の独立したノートがどこかに出ている」ことを
    // 区別できない —— 実際、リポストの埋め込みをわざと壊す変異
    // (`Show when={target}` を `when={false}` にする) を試したところ、
    // 独立ノートのおかげでこの手の緩い assertion は素通りしてしまった。
    // そこで `[data-variant="compact"]` を持つ `event-view` に絞って探す
    // ことで、「compact として実際に埋め込まれている」ことまで主張する
    // (standalone の対象ノートは "full" で描かれるので compact には出ない)。
    const compactWith = (text: string) =>
      related.locator('[data-testid="event-view"][data-variant="compact"]', {
        hasText: text,
      });

    // 1. リポストが repost-by と対象の本文 (compact 埋め込み) を出す。
    // 捕まえる変異: RepostFull が resolveRepostTarget の結果を EventView へ
    // 渡さない (対象が描かれない)、または repost-by 自体を出さない。
    await expect(related.getByTestId("repost-by").first()).toBeVisible({
      timeout: 20_000,
    });
    const repostCompact = compactWith(previewRepostTargetNoteText);
    await expect(repostCompact.first()).toBeVisible({ timeout: 20_000 });

    // 2. 引用が event-view[data-variant="compact"] の中に引用先の本文を
    // 出す。捕まえる変異: NoteFull が quoteTargets() の結果を EventView へ
    // 渡さない、または variant を "full" のまま渡す (compact の規則が壊れる)。
    const quoteCompact = compactWith(previewQuoteTargetNoteText);
    await expect(quoteCompact.first()).toBeVisible({ timeout: 20_000 });
    // 引用元のノート自体 (kind:1, q タグを持つほう) も related 列に
    // 独立したアイテムとして出ている。これは compact に埋め込まれる側では
    // なく related 列直下の通常のアイテムなので、列全体への toContainText
    // で問題ない (曖昧さが無い — previewQuoteNoteText はこのノート自身の
    // 本文としてしか登場しない)。
    await expect(related).toContainText(previewQuoteNoteText);

    // 3. 返信が reply-to と、親の本文 (compact 埋め込み) を出す。
    // 捕まえる変異: NoteFull が replyTarget() の marker 判定 (reply/root)
    // を外す、または reply-to の描画条件 (ref().pubkey の有無) を反転する。
    await expect(related.getByTestId("reply-to").first()).toBeVisible({
      timeout: 20_000,
    });
    const replyCompact = compactWith(previewReplyParentNoteText);
    await expect(replyCompact.first()).toBeVisible({ timeout: 20_000 });
    // 返信ノート自体の本文 (previewReplyNoteText) は他のどの compact にも
    // 埋め込まれない、返信ノート自身にしか登場しないので列全体への
    // toContainText で問題ない。
    await expect(related).toContainText(previewReplyNoteText);

    // 4. 未登録の kind (30023) が unknown-kind を出し、**カラムが壊れない**。
    // fallback が出ること自体は半分の主張でしかない —— fallback の目的は
    // 「1 件の未対応イベントがカラム全体を道連れにしない」ことなので、
    // unknown-kind が見えている状態で他のアイテム (リポスト/引用/返信)
    // も引き続き描かれていることまで確かめる。
    // 捕まえる変異: EventView が未登録 kind で例外を投げる (現状は
    // UnknownKind へ fallback するので投げない)、または fallback の描画が
    // 他のアイテムの描画を巻き込んで止める。
    await expect(related.getByTestId("unknown-kind").first()).toBeVisible({
      timeout: 20_000,
    });
    await expect(related).toContainText(previewUnknownKindNoteText);
    // fallback が出た**後**でも、それ以前に確かめた 3 つの経路 (リポスト/
    // 引用/返信、いずれも compact 埋め込みの中身つき) がまだ画面に残って
    // いることを再確認する。
    await expect(related.getByTestId("repost-by").first()).toBeVisible();
    await expect(repostCompact.first()).toBeVisible();
    await expect(quoteCompact.first()).toBeVisible();
    await expect(related.getByTestId("reply-to").first()).toBeVisible();
    await expect(replyCompact.first()).toBeVisible();
    // 7 件 (repostTarget/repost/quoteTarget/quote/replyParent/reply/
    // unknown-kind の各イベント) 以上のアイテムが同時に描かれている ——
    // fallback だけが生き残って他が消える壊れ方であれば、この数まで
    // 届かない。
    const itemCount = await related.getByTestId("item").count();
    expect(itemCount).toBeGreaterThanOrEqual(7);
  });

  /**
   * task-7-brief.md Step 4: 水和が実際に相② (kind:10002 の一括取得) を
   * 間引くことの唯一の実測経路。
   *
   * **`phase2Ms` の「明確に短くなった」ではなく「正確に 0 になった」を
   * 主張する。** ローカル docker リレーのシードは閲覧者+著者 2 人の
   * 3 人だけで、相②のフェッチ自体が数十 ms 未満で終わる環境では
   * ms のしきい値比較が測定誤差に埋もれて不安定になる (brief に明記された
   * 懸念)。一方 `bootstrap.ts` の相② は `staleRelayListAuthors.length > 0`
   * のときしか `collect()` を呼ばず、呼ばなければ `phase2Ms` は初期値の
   * `0` から一切動かない —— 全員新鮮なら「REQ を一切出さない」が
   * `phase2Ms === 0` という 2 桁固定の文字列として厳密に観測できる。
   */
  test("a cached relay list skips phase 2 requests on the next load", async ({
    page,
  }) => {
    test.setTimeout(60_000);

    // developer-mode-toggle 経由ではなくログイン前から有効にしておく
    // (2 回のログインを挟むこのテストで、毎回トグルを押し直す手間を省く。
    // 「リロードしても開発者モードが残る」こと自体は別の spec が既に
    // 主張済み)。
    await stubSigner(page);
    await enableDeveloperMode(page);
    await page.goto(`/v1?relays=${previewRelayUrl}`);

    await page.getByTestId("login").click();
    await expect(page.getByTestId("viewer-pubkey")).toHaveText(
      previewViewerPubkey,
      { timeout: 15_000 },
    );

    const warmUpPhases = page.getByTestId("warm-up-phases");
    // "phase1: - / phase2: -" (warmUp() 未確定) のままでは何も主張していない
    // ことになるので、確定するまで待ってから中身を読む。
    await expect(warmUpPhases).not.toHaveText(/phase2: -/, {
      timeout: 20_000,
    });
    const readPhase2Ms = async (): Promise<number> => {
      const text = await warmUpPhases.textContent();
      const match = text?.match(/phase2: ([\d.]+) ms/);
      if (!match) {
        throw new Error(`could not parse phase2Ms out of "${text}"`);
      }
      return Number(match[1]);
    };

    // 1 回目: キャッシュが空なので、相②は閲覧者+フォロイー 2 人ぶんの
    // kind:10002 を実際に REQ する (0 では終わらない)。
    expect(await readPhase2Ms()).toBeGreaterThan(0);

    // IndexedDB への書き込みは PERSIST_BATCH_MS (indexeddb-persistence.ts,
    // 1 秒) の窓でまとめられる。この窓が閉じる前にリロードすると、取った
    // ばかりの kind:10002 がまだ書かれておらず、次のロードもキャッシュ無し
    // のままになる —— これはテストの都合で足す待ちではなく、実装のバッチ窓
    // そのものを跨ぐために必要な待ち。
    await page.waitForTimeout(1_500);

    await page.reload();
    await page.getByTestId("login").click();
    await expect(page.getByTestId("viewer-pubkey")).toHaveText(
      previewViewerPubkey,
      { timeout: 15_000 },
    );
    await expect(warmUpPhases).not.toHaveText(/phase2: -/, {
      timeout: 20_000,
    });

    // 2 回目: 相②の対象全員 (閲覧者+フォロイー 2 人) の kind:10002 が
    // 7 日以内に取得済みで新鮮 —— collect() 自体が呼ばれず、phase2Ms は
    // 初期値の 0 のまま確定する。
    expect(await readPhase2Ms()).toBe(0);

    // IndexedDB を消せば元の (キャッシュ無しの) 挙動に戻ることも確かめる ——
    // 「たまたま 0 になった」のではなく実際に永続層を読んでいることの
    // 反証可能性を担保する (task-7-brief.md Step 4)。`/v1` へ直接
    // `page.evaluate` するとアプリ自身が同じ DB への接続を握ったままで
    // deleteDatabase() がその接続の解放を待って止まってしまうため、
    // 読み取り層を持たない "/" へ一度逃がしてから消す。
    await page.goto("/");
    await page.evaluate(
      () =>
        new Promise<void>((resolve, reject) => {
          const request = indexedDB.deleteDatabase("streets.v1");
          request.onsuccess = () => resolve();
          request.onerror = () => reject(request.error);
          request.onblocked = () => resolve();
        }),
    );

    await page.goto(`/v1?relays=${previewRelayUrl}`);
    await page.getByTestId("login").click();
    await expect(page.getByTestId("viewer-pubkey")).toHaveText(
      previewViewerPubkey,
      { timeout: 15_000 },
    );
    await expect(warmUpPhases).not.toHaveText(/phase2: -/, {
      timeout: 20_000,
    });
    expect(await readPhase2Ms()).toBeGreaterThan(0);
  });
});
