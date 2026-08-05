import { type EventTemplate, Relay } from "nostr-tools";
import { finalizeEvent, getPublicKey } from "nostr-tools/pure";

export const previewRelayUrl =
  process.env.STREETS_E2E_RELAY_URL ?? "ws://127.0.0.1:8080";

const now = 1_735_689_600;

// e2e/fixtures/seed-outbox.ts と同じ鍵生成の作りだが、既存フィクスチャの
// pubkey と衝突しないよう別のシード帯を使う (fixture-pubkeys.test.ts が
// pairwise distinctness を機械的に検証する — このファイルを足すときも
// そちらの一覧に追加した)。
const secretKey = (seed: number) =>
  Uint8Array.from(
    Array.from({ length: 32 }, (_, i) => ((seed + i * 7) % 255) + 1),
  );

const viewerSecretKey = secretKey(70_000);
const authorOneSecretKey = secretKey(70_100);
const authorTwoSecretKey = secretKey(70_200);

export const previewViewerPubkey = getPublicKey(viewerSecretKey);
export const previewAuthorOnePubkey = getPublicKey(authorOneSecretKey);
export const previewAuthorTwoPubkey = getPublicKey(authorTwoSecretKey);

export const previewViewerDisplayName = "streets preview viewer";
export const previewAuthorOneDisplayName = "streets preview author one";
export const previewAuthorTwoDisplayName = "streets preview author two";

export const previewViewerSeedNoteText = "streets preview viewer seed note";
export const previewAuthorOneNoteText = "streets preview author one note";
export const previewAuthorTwoNoteText = "streets preview author two note";

/**
 * `window.nostr.signEvent` のブラウザ側スタブから `page.exposeFunction` 経由
 * で呼ぶ、閲覧者としての**本物の**署名 (task-6-report.md の手法と同じ)。
 * `nostr-tools/pure` の `finalizeEvent` は内部で `@noble/curves` の schnorr
 * 実装を使う — モックの sig では `EventStore.put` の検証を通らないので、
 * 縦断 e2e (特に主張 4: 投稿が自分のカラムに出る) には本物の署名が要る。
 */
export const signAsPreviewViewer = (template: EventTemplate) =>
  finalizeEvent(template, viewerSecretKey);

const publish = async (
  relay: Relay,
  template: EventTemplate,
  key: Uint8Array,
) => {
  await relay.publish(finalizeEvent(template, key));
};

/**
 * task-7-brief.md Step 1: 「閲覧者 1 人 + フォロー相手 2 人、それぞれの
 * kind:0 と kind:1、閲覧者と著者の kind:10002」。単一リレー構成 —— Outbox
 * のリレー分割は既に e2e/fixtures/seed-outbox.ts が確認済みで、このフィク
 * スチャの役目はログイン→カラム表示→投稿→リロード復元を 1 本通すこと。
 */
export const seedPreviewFixture = async (): Promise<void> => {
  const relay = await Relay.connect(previewRelayUrl);

  const profile = (name: string) =>
    JSON.stringify({ name, display_name: name });

  // kind:0 — 3 人分
  await publish(
    relay,
    {
      kind: 0,
      created_at: now,
      tags: [],
      content: profile(previewViewerDisplayName),
    },
    viewerSecretKey,
  );
  await publish(
    relay,
    {
      kind: 0,
      created_at: now,
      tags: [],
      content: profile(previewAuthorOneDisplayName),
    },
    authorOneSecretKey,
  );
  await publish(
    relay,
    {
      kind: 0,
      created_at: now,
      tags: [],
      content: profile(previewAuthorTwoDisplayName),
    },
    authorTwoSecretKey,
  );

  // kind:10002 — 閲覧者と著者 2 人 (write は全員このリレー)。閲覧者の分が
  // 無いと投稿の publish 先が解決できない (publisher.ts は
  // routing.writeRelaysFor(署名者) を見る)。
  for (const key of [viewerSecretKey, authorOneSecretKey, authorTwoSecretKey]) {
    await publish(
      relay,
      {
        kind: 10002,
        created_at: now,
        tags: [["r", previewRelayUrl, "write"]],
        content: "",
      },
      key,
    );
  }

  // 閲覧者のフォローリスト — 著者 2 人
  await publish(
    relay,
    {
      kind: 3,
      created_at: now,
      tags: [
        ["p", previewAuthorOnePubkey],
        ["p", previewAuthorTwoPubkey],
      ],
      content: "",
    },
    viewerSecretKey,
  );

  // kind:1 — 3 人分。閲覧者の分は「mine」列が最初から空でないことを見せる
  // (composer での投稿は別に追加されるので、こちらと混同しないよう文面を
  // 分けてある)。
  await publish(
    relay,
    {
      kind: 1,
      created_at: now + 10,
      tags: [],
      content: previewViewerSeedNoteText,
    },
    viewerSecretKey,
  );
  await publish(
    relay,
    {
      kind: 1,
      created_at: now + 11,
      tags: [],
      content: previewAuthorOneNoteText,
    },
    authorOneSecretKey,
  );
  await publish(
    relay,
    {
      kind: 1,
      created_at: now + 12,
      tags: [],
      content: previewAuthorTwoNoteText,
    },
    authorTwoSecretKey,
  );

  relay.close();
  console.log(`[streets seed:preview] relay=${previewRelayUrl}`);
};

if (import.meta.url === `file://${process.argv[1]}`) {
  await seedPreviewFixture();
}
