import { expect, test } from "@playwright/test";
import {
  threadAuthorPubkey,
  threadIntermediateNoteText,
  threadRelayUrl,
  threadReply1NoteText,
  threadReply2NoteText,
  threadRootNoteText,
  threadSelectedNoteText,
  threadViewerPubkey,
} from "./fixtures/seed-thread.js";

/**
 * ログインは `getPublicKey()` しか呼ばない (`v1.tsx` の `login()`) ので、
 * 本物の署名は要らない。`v1.spec.ts` の `stubSigner` は投稿の楽観挿入
 * (`EventStore.put` の schnorr 検証) を通すために本物の署名を使っている
 * が、この spec は何も publish しないので、ダミーの sig で足りる。
 */
const stubReadOnlySigner = async (page: import("@playwright/test").Page) => {
  await page.addInitScript((viewerPubkey: string) => {
    (window as typeof window & { nostr: unknown }).nostr = {
      getPublicKey: async () => viewerPubkey,
      signEvent: async (event: Record<string, unknown>) => ({
        ...event,
        id: "playwright-thread-mock-event-id",
        pubkey: viewerPubkey,
        sig: "playwright-thread-mock-signature",
      }),
    };
  }, threadViewerPubkey);
};

/**
 * `column-presets.ts` の 4 種別はどれもクエリを固定で組み立てるので、
 * UI からはスレッドフィクスチャの著者だけに絞ったカラムを作れない ——
 * `v1.spec.ts` の `seedRelatedEventsDeck` と同じ理由で、`deck.ts` の
 * 永続化フォーマットへ直接書き込む。
 */
const seedThreadDeck = async (page: import("@playwright/test").Page) => {
  await page.addInitScript(
    ({ pubkey, relay, author }) => {
      const deck = {
        version: 2,
        columns: [
          {
            id: "home",
            title: "home",
            source: {
              kind: "literal",
              filters: [{ kinds: [1], authors: [author] }],
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
      pubkey: threadViewerPubkey,
      relay: threadRelayUrl,
      author: threadAuthorPubkey,
    },
  );
};

test.describe("thread", () => {
  /**
   * 縦断 e2e: カラムの入れ子 (返信先プレビュー) を押すとその入れ子自身の
   * スレッドが開き (「内側が勝つ」)、そこから返信を辿って別の背骨へ進み、
   * さらに祖先を押して根まで引き直せて、戻ると元のカラムへ戻る。
   *
   * 祖先を根・中間の 2 段にしているのは (`seed-thread.ts`)、根への
   * 1 ジャンプで祖先を埋める実装でも 1 段なら正しい答えになってしまい、
   * 何も検出できないため —— 手順 4 (祖先を押して背骨を根まで引き直す) が
   * この取り違えを実際に落とす。
   */
  test("clicking a nested preview opens its own thread, a reply and an ancestor re-root it, and back returns to the column", async ({
    page,
  }) => {
    test.setTimeout(60_000);

    await stubReadOnlySigner(page);
    await seedThreadDeck(page);
    await page.goto(`/v1?relays=${threadRelayUrl}`);

    await page.getByTestId("login").click();
    await expect(page.getByTestId("viewer-pubkey")).toHaveText(
      threadViewerPubkey,
      { timeout: 15_000 },
    );

    const homeColumn = page.locator(
      '[data-testid="deck-column"][data-column-id="home"]',
    );
    await expect(homeColumn).toBeVisible();

    // このカラムには根・中間・選択・返信 1・返信 2 の 5 件が並ぶ。「選択」
    // は自身が「中間」への返信でもあるので、`full` 描画は返信先プレビュー
    // (中間、compact、`selected` の外側 `<article>` に入れ子) を本文の上に
    // 持つ。`[data-testid="item"]` 直下の外側 `<article>` だけに絞った
    // うえで、返信の本文 ("reply") を持つものを除くことで、「選択」自身の
    // 外側 `<article>` 1 件だけに絞り込む (返信 1・2 の外側 `<article>` も
    // 「選択」への返信先プレビューを入れ子に持ち、その本文には「選択」の
    // テキストが含まれてしまうため)。
    const topLevelNotes = homeColumn.locator(
      '[data-testid="item"] > [data-testid="event-view"] > [data-testid="note"]',
    );
    const selectedNote = topLevelNotes
      .filter({ hasText: threadSelectedNoteText })
      .filter({ hasNotText: "reply" });
    await expect(selectedNote).toHaveCount(1, { timeout: 20_000 });

    // 1. 「選択」の外側 `<article>` の中に入れ子で出ている返信先プレビュー
    // (中間、compact) を押す —— 「入れ子は内側が勝つ」(`Note.tsx`) の実地
    // 確認。開くのは中間のスレッドであって選択のスレッドではない。
    //
    // 捕まえる変異: `Note.tsx` の `stopPropagation()` を落とすと、内側
    // (中間) の `open()` の後にも click がバブリングして外側 (選択) の
    // `open()` まで呼ばれ、[中間, 選択] と余分に積まれる —— 最終的な focus
    // は選択のままなので下の「中間が開く」主張がそのまま落ちる。
    // (ThreadView の内部、たとえば focus 自身の返信先プレビューで同じ操作
    // をしても、外側の `event()` アクセサがスタックの変化を追って同じ id
    // へ即座に切り替わってしまい、二重発火が id の一致で相殺されて見えなく
    // なる —— カラムの `<For>` の外側は items() 由来の安定した id なので、
    // ここでだけ二重発火が id の不一致として観測できる。)
    const nestedReplyPreview = selectedNote.locator(
      '[data-testid="event-view"][data-variant="compact"] [data-testid="note"]',
    );
    await expect(nestedReplyPreview).toHaveCount(1);
    await nestedReplyPreview.click();

    const thread = page.getByTestId("thread");
    await expect(thread).toBeVisible();

    const ancestors = thread.getByTestId("thread-ancestor");
    const focus = thread.getByTestId("thread-focus");
    const replies = thread.getByTestId("thread-reply");

    await expect(ancestors).toHaveCount(1, { timeout: 20_000 });
    await expect(ancestors.nth(0)).toContainText(threadRootNoteText);
    await expect(focus).toContainText(threadIntermediateNoteText);
    await expect(replies).toHaveCount(1);
    await expect(replies.nth(0)).toContainText(threadSelectedNoteText);
    // focus (中間) 自身の親は根 —— 根は既に ancestors.nth(0) として出ている
    // ので、focus の中でもう一度描かれていないことを数で確かめる。
    // `toContainText` は部分一致なので二重表示があっても素通りしてしまう
    // (`NoteFull` が自前の返信先プレビューを持つため、focus を素朴に
    // `full` で描くと親がここでもう一度並ぶ)。
    await expect(thread.getByText(threadRootNoteText)).toHaveCount(1);

    // 2. 返信 (選択) を押す —— 独立した compact 記事で入れ子を持たないので
    // 内側/外側の区別は関係しない。祖先 2 件 (根 → 中間の順)、focus が
    // 選択したイベント、返信 2 件 (作成順) が出る。
    // 捕まえる変異: compact ノード (`NoteCompact`) にクリックハンドラを
    // 付けない —— このとき返信を押しても何も起こらない。
    await replies.nth(0).click();

    await expect(ancestors).toHaveCount(2, { timeout: 20_000 });
    await expect(ancestors.nth(0)).toContainText(threadRootNoteText);
    await expect(ancestors.nth(1)).toContainText(threadIntermediateNoteText);
    await expect(focus).toContainText(threadSelectedNoteText);
    await expect(replies).toHaveCount(2);
    await expect(replies.nth(0)).toContainText(threadReply1NoteText);
    await expect(replies.nth(1)).toContainText(threadReply2NoteText);
    // focus (選択) の親は中間 —— ancestors.nth(1) と同じ二重表示の懸念。
    await expect(thread.getByText(threadIntermediateNoteText)).toHaveCount(1);

    // 3. 祖先の 1 件目 (根) を押す —— 背骨が根を focus に引き直される。
    // 捕まえる変異: 手順 2 と同じ (compact にクリックハンドラが無ければ
    // 祖先を押しても再描画は起きない)。
    await ancestors.nth(0).click();

    await expect(ancestors).toHaveCount(0, { timeout: 20_000 });
    await expect(focus).toContainText(threadRootNoteText);
    await expect(replies).toHaveCount(1);
    await expect(replies.nth(0)).toContainText(threadIntermediateNoteText);

    // 4. 戻るを押すと元のカラムへ戻り、items が出ている。
    //
    // スタックは push 型 (`DeckColumn.tsx` の `openThread`/`closeThread`)
    // —— ここまでで「中間」(手順 1)・「選択」(手順 2)・「根」(手順 3) の
    // 順に 3 回 push しているので、カラムへ戻るには「戻る」を 3 回押す
    // 必要がある。pop はスタックの末尾から剥がすので、戻る順序は push と
    // 逆 (根 → 選択 → 中間)。
    const back = page.getByTestId("thread-back");
    await back.click();
    await expect(focus).toContainText(threadSelectedNoteText, {
      timeout: 20_000,
    });
    await back.click();
    await expect(focus).toContainText(threadIntermediateNoteText, {
      timeout: 20_000,
    });
    await back.click();

    await expect(thread).toHaveCount(0);
    const items = homeColumn.getByTestId("items");
    await expect(items).toBeVisible();
    await expect(homeColumn.getByTestId("item")).not.toHaveCount(0);
    await expect(homeColumn).toContainText(threadSelectedNoteText);
  });
});
