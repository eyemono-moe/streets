import { type EventTemplate, Relay } from "nostr-tools";
import { finalizeEvent, getPublicKey } from "nostr-tools/pure";

export const threadRelayUrl =
  process.env.STREETS_E2E_RELAY_URL ?? "ws://127.0.0.1:8080";

const now = 1_735_689_600;

// e2e/fixtures/seed-preview.ts と同じ鍵生成の作りだが、既存フィクスチャの
// pubkey と衝突しないよう別のシード帯を使う (fixture-pubkeys.test.ts が
// pairwise distinctness を機械的に検証する — このファイルを足すときも
// そちらの一覧に追加した)。
const secretKey = (seed: number) =>
  Uint8Array.from(
    Array.from({ length: 32 }, (_, i) => ((seed + i * 7) % 255) + 1),
  );

const viewerSecretKey = secretKey(90_000);
const authorSecretKey = secretKey(90_100);

export const threadViewerPubkey = getPublicKey(viewerSecretKey);
export const threadAuthorPubkey = getPublicKey(authorSecretKey);

export const threadRootNoteText = "streets thread e2e root note";
export const threadIntermediateNoteText =
  "streets thread e2e intermediate note";
export const threadSelectedNoteText = "streets thread e2e selected note";
export const threadReply1NoteText = "streets thread e2e reply one note";
export const threadReply2NoteText = "streets thread e2e reply two note";

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
 * 押して開いた先で入れ子から辿れることを主張するための、祖先 2 段の
 * スレッド。**1 段では足りない** —— 根への 1 ジャンプで祖先を全部
 * 出してしまう実装 (親を 1 段ずつ辿らない) でも 1 段なら正しい答えに
 * なってしまい、e2e が何も検出できない。祖先を「根」「中間」の 2 段に
 * することで、この取り違えを e2e が実際に落とせるようにする。
 *
 * 単一の著者がスレッド全体を発言する形にしている ——
 * このフィクスチャの役目は「祖先を 2 段辿って再描画できるか」の 1 点で、
 * 発言者を分けても主張は増えない。
 */
export const seedThreadFixture = async (): Promise<void> => {
  const relay = await Relay.connect(threadRelayUrl);

  const root = await publishAndReturn(
    relay,
    {
      kind: 1,
      created_at: now + 40,
      tags: [],
      content: threadRootNoteText,
    },
    authorSecretKey,
  );

  const intermediate = await publishAndReturn(
    relay,
    {
      kind: 1,
      created_at: now + 41,
      tags: [["e", root.id, "", "root"]],
      content: threadIntermediateNoteText,
    },
    authorSecretKey,
  );

  const selected = await publishAndReturn(
    relay,
    {
      kind: 1,
      created_at: now + 42,
      tags: [
        ["e", root.id, "", "root"],
        ["e", intermediate.id, "", "reply"],
      ],
      content: threadSelectedNoteText,
    },
    authorSecretKey,
  );

  await publishAndReturn(
    relay,
    {
      kind: 1,
      created_at: now + 43,
      tags: [
        ["e", root.id, "", "root"],
        ["e", selected.id, "", "reply"],
      ],
      content: threadReply1NoteText,
    },
    authorSecretKey,
  );

  // created_at を返信 1 より後にする —— thread-reply の並び順 (created_at
  // 昇順、threadSpine.ts) を e2e から主張できるようにするため。
  await publishAndReturn(
    relay,
    {
      kind: 1,
      created_at: now + 44,
      tags: [
        ["e", root.id, "", "root"],
        ["e", selected.id, "", "reply"],
      ],
      content: threadReply2NoteText,
    },
    authorSecretKey,
  );

  relay.close();
  console.log(`[streets seed:thread] relay=${threadRelayUrl}`);
};

if (import.meta.url === `file://${process.argv[1]}`) {
  await seedThreadFixture();
}
