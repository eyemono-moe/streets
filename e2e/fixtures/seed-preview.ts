import { type EventTemplate, Relay } from "nostr-tools";
import { noteEncode } from "nostr-tools/nip19";
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

// previewAuthorOne の kind:0 を厚くする分。about にカスタム絵文字
// (NIP-30) と `nostr:note` の参照を両方入れておくと、v0 が kind:0 の
// タグを捨てていて about の絵文字が出ない欠陥 (プロフィールカード仕様
// 1 節) を e2e で実測できる。
export const previewAuthorOneAboutEmojiName = "streetsprofileemoji";
export const previewAuthorOneAboutEmojiUrl =
  "https://images.invalid/streets-preview-profile-emoji.png";
// note の参照先は eventRefs="text" (ProfileCard) では短縮テキストにしか
// ならず、実際に取得されない —— 実在するイベントである必要はない。
const previewAuthorOneAboutNoteId = "f".repeat(64);
// 絵文字/note 参照はトークン化されて元の文字列のままでは画面に残らない
// (前者は <img>、後者は短縮テキストになる) —— e2e が「about の本文が
// 読める」ことを突き合わせるのはこのプレーンテキストの断片のみ。
export const previewAuthorOneAboutPrefix =
  "streets preview author one about text";
export const previewAuthorOneAboutText = `${previewAuthorOneAboutPrefix} :${previewAuthorOneAboutEmojiName}: nostr:${noteEncode(previewAuthorOneAboutNoteId)}`;
const previewAuthorOneNip05 = "authorone@streets-preview.invalid";
const previewAuthorOneWebsite = "https://streets-preview.invalid/authorone";
const previewAuthorOneBanner =
  "https://images.invalid/streets-preview-banner.png";

export const previewViewerSeedNoteText = "streets preview viewer seed note";
export const previewAuthorOneNoteText = "streets preview author one note";
export const previewAuthorTwoNoteText = "streets preview author two note";

// リポスト/引用/返信/未登録 kind、それぞれの対象と本体。対象ノートの本文を
// ここで export するのは、e2e が「対象の本文が compact 表示の中に出ている」
// ことをこの定数と突き合わせて主張するため。
export const previewRepostTargetNoteText = "streets preview repost target note";
export const previewQuoteTargetNoteText = "streets preview quote target note";
/**
 * 引用先ノートに載せる画像 URL。同じ 1 件が「単体では `full`、引用の中では
 * `compact`」の両方で描かれるので、`full` だけがインライン展開するという
 * 規則を 1 つのシードで両側から主張できる。**ホストは実在しない** ——
 * e2e 側で `page.route` が差し替える (実ネットワークへ出さないため)。
 */
export const previewImageUrl = "https://images.invalid/streets-preview.png";
export const previewReplyParentNoteText = "streets preview reply parent note";
export const previewQuoteNoteText = "streets preview quote note";
export const previewReplyNoteText = "streets preview reply note";
export const previewUnknownKindNoteText =
  "streets preview unknown kind content";

// NIP-30 のカスタム絵文字リアクションが使うショートコード名と画像 URL。
// 実在しないホスト (previewImageUrl と同じ帯) をそのまま使い、スタブしない
// —— 画像が落ちても `reaction-group` / `reaction-count` は描かれるので、
// 読み込みの成否は e2e の主張に関わらない。
const previewReactionEmojiName = "streetsparrot";
const previewReactionEmojiUrl =
  "https://images.invalid/streets-preview-emoji.png";

/**
 * `window.nostr.signEvent` のブラウザ側スタブから `page.exposeFunction` 経由
 * で呼ぶ、閲覧者としての**本物の**署名 (task-6-report.md の手法と同じ)。
 * `nostr-tools/pure` の `finalizeEvent` は内部で `@noble/curves` の schnorr
 * 実装を使う — モックの sig では `EventStore.put` の検証を通らないので、
 * 縦断 e2e (特に主張 4: 投稿が自分のカラムに出る) には本物の署名が要る。
 */
export const signAsPreviewViewer = (template: EventTemplate) =>
  finalizeEvent(template, viewerSecretKey);

/** 通知リレーの切替 e2e で、閲覧者宛の他人のイベントを作る。 */
export const signAsPreviewAuthorOne = (template: EventTemplate) =>
  finalizeEvent(template, authorOneSecretKey);

const publish = async (
  relay: Relay,
  template: EventTemplate,
  key: Uint8Array,
) => {
  await relay.publish(finalizeEvent(template, key));
};

/**
 * `publish` と同じだが、署名済みイベント (id を含む) を呼び出し側へ返す。
 * リポスト/引用/返信は対象イベントの id を `e`/`q` タグに埋め込む必要が
 * あり、`publish` のように投げっぱなしではその id を知る手段が無い。
 */
const publishAndReturn = async (
  relay: Relay,
  template: EventTemplate,
  key: Uint8Array,
) => {
  const event = finalizeEvent(template, key);
  await relay.publish(event);
  return event;
};

/**
 * 「閲覧者 1 人 + フォロー相手 2 人、それぞれの kind:0 と kind:1、閲覧者と
 * 著者の kind:10002」の単一リレー構成 —— Outbox のリレー分割は既に
 * e2e/fixtures/seed-outbox.ts が確認済みで、このフィクスチャの役目は
 * ログイン→カラム表示→投稿→リロード復元を 1 本通すこと。
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
  // authorOne だけ厚くする —— プロフィールカード (about/banner/nip05/
  // website) と、about のカスタム絵文字を実測するのはこの 1 人で足りる。
  await publish(
    relay,
    {
      kind: 0,
      created_at: now,
      tags: [
        [
          "emoji",
          previewAuthorOneAboutEmojiName,
          previewAuthorOneAboutEmojiUrl,
        ],
      ],
      content: JSON.stringify({
        name: previewAuthorOneDisplayName,
        display_name: previewAuthorOneDisplayName,
        about: previewAuthorOneAboutText,
        banner: previewAuthorOneBanner,
        nip05: previewAuthorOneNip05,
        website: previewAuthorOneWebsite,
      }),
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

  // リポスト (kind:6, content 埋め込みあり + e タグあり)。対象は authorOne
  // のノート — 先に対象を発行して id を確定させてから、その id を e タグと
  // content の埋め込み (NIP-18) の両方に使う。
  const repostTargetNote = await publishAndReturn(
    relay,
    {
      kind: 1,
      created_at: now + 13,
      tags: [],
      content: previewRepostTargetNoteText,
    },
    authorOneSecretKey,
  );
  await publish(
    relay,
    {
      kind: 6,
      created_at: now + 14,
      tags: [
        ["e", repostTargetNote.id, previewRelayUrl],
        ["p", previewAuthorOnePubkey],
      ],
      content: JSON.stringify(repostTargetNote),
    },
    authorTwoSecretKey,
  );

  // 引用 (kind:1, q タグ)。対象は authorTwo のノート。
  const quoteTargetNote = await publishAndReturn(
    relay,
    {
      kind: 1,
      created_at: now + 15,
      tags: [],
      content: `${previewQuoteTargetNoteText} ${previewImageUrl}`,
    },
    authorTwoSecretKey,
  );
  await publish(
    relay,
    {
      kind: 1,
      created_at: now + 16,
      tags: [
        ["q", quoteTargetNote.id, previewRelayUrl, previewAuthorTwoPubkey],
      ],
      content: previewQuoteNoteText,
    },
    viewerSecretKey,
  );

  // 返信 (kind:1, e タグ + root marker + pubkey 要素あり)。対象は authorOne
  // のノート。pubkey 要素があることで、`replyTarget()` が親イベント本体の
  // 到着を待たずに「@x への返信」の名前を出せる (Note.tsx 参照)。
  const replyParentNote = await publishAndReturn(
    relay,
    {
      kind: 1,
      created_at: now + 17,
      tags: [],
      content: previewReplyParentNoteText,
    },
    authorOneSecretKey,
  );
  await publish(
    relay,
    {
      kind: 1,
      created_at: now + 18,
      tags: [
        [
          "e",
          replyParentNote.id,
          previewRelayUrl,
          "root",
          previewAuthorOnePubkey,
        ],
      ],
      content: previewReplyNoteText,
    },
    authorTwoSecretKey,
  );

  // 未登録の kind (kind:30023、長文記事)。`defaultRenderers` (renderers/index.ts)
  // に登録が無い kind の代表として使う — fallback (`unknown-kind`) を e2e で
  // 確かめる対象。
  await publish(
    relay,
    {
      kind: 30023,
      created_at: now + 19,
      tags: [],
      content: previewUnknownKindNoteText,
    },
    viewerSecretKey,
  );

  // 引用先ノート (quoteTargetNote) への kind:7 を 3 件。`+` (like) を
  // authorOne/authorTwo の 2 人、NIP-30 のカスタム絵文字
  // を viewer の 1 人。同じ対象へ 3 者が反応することで、一覧の集計 (仕様 8
  // 節 の一覧テスト) が「like が 2、emoji が 1」の 2 山になる —— 1 件 1 枠に
  // 描いてしまう欠陥 (集計しない変異) と、正しく山にまとめる実装を e2e で
  // 区別できる。この 3 件は authorOne/authorTwo/viewer のいずれかが発行主
  // なので、"related" 列のフィルタ (authors がこの 3 人) にも独立して乗り、
  // 「タイムラインに流れる kind:7」も同時に満たす (フィルタの kinds に 7 を
  // 足すのは e2e 側、seedRelatedEventsDeck)。
  await publish(
    relay,
    {
      kind: 7,
      created_at: now + 20,
      tags: [
        ["e", quoteTargetNote.id, previewRelayUrl],
        ["p", previewAuthorTwoPubkey],
      ],
      content: "+",
    },
    authorOneSecretKey,
  );
  await publish(
    relay,
    {
      kind: 7,
      created_at: now + 21,
      tags: [
        ["e", quoteTargetNote.id, previewRelayUrl],
        ["p", previewAuthorTwoPubkey],
      ],
      content: "+",
    },
    authorTwoSecretKey,
  );
  await publish(
    relay,
    {
      kind: 7,
      created_at: now + 22,
      tags: [
        ["e", quoteTargetNote.id, previewRelayUrl],
        ["p", previewAuthorTwoPubkey],
        ["emoji", previewReactionEmojiName, previewReactionEmojiUrl],
      ],
      content: `:${previewReactionEmojiName}:`,
    },
    viewerSecretKey,
  );

  relay.close();
  console.log(`[streets seed:preview] relay=${previewRelayUrl}`);
};

if (import.meta.url === `file://${process.argv[1]}`) {
  await seedPreviewFixture();
}
