import { type EventTemplate, Relay } from "nostr-tools";
import { finalizeEvent, getPublicKey } from "nostr-tools/pure";

export const relayOneUrl =
  process.env.STREETS_E2E_RELAY_URL ?? "ws://127.0.0.1:8080";
export const relayTwoUrl =
  process.env.STREETS_E2E_RELAY_2_URL ?? "ws://127.0.0.1:8081";

/**
 * 実在しない架空リレー。接続は必ず失敗する — それが目的 (unreachableRelays)。
 *
 * ポート帯を意図的に 7000 番台にして、ローカルリレー2 (`8081`) より
 * **辞書順で前**に来るようにしてある (Task 12 fix round 1)。9000 番台の
 * ままだと、gain (被覆する著者数) を無視してただ辞書順に候補を拾うだけの
 * 実装でも「pinned のリレー1 → 辞書順で次に来るリレー2 → 架空リレー」を
 * 選んでしまい、正しい貪欲実装と見分けが付かない偶然の一致になる。
 * 7000 番台なら、gain を見ない実装は架空リレーを先に拾ってリレー2 を
 * 弾き出す (D の投稿が出ない) ので、gain=2 のリレー2 を貪欲に選べているか
 * を e2e が実際に検出できる。
 */
const fakeRelayUrls = [
  "ws://127.0.0.1:7001/",
  "ws://127.0.0.1:7002/",
  "ws://127.0.0.1:7003/",
  "ws://127.0.0.1:7004/",
];

export const budgetNoteOneText = "budget author A note";
export const budgetNoteTwoText = "budget author D note";

const now = 1_735_689_600;

// e2e/fixtures/seed-outbox.ts と同じ鍵生成の作りだが、閲覧者・著者の
// pubkey が既存の e2e フィクスチャと衝突しないよう別のシード帯を使う。
const secretKey = (seed: number) =>
  Uint8Array.from(
    Array.from({ length: 32 }, (_, i) => ((seed + i * 7) % 255) + 1),
  );

const viewerSecretKey = secretKey(911);

// A・B・C → ローカルリレー1, D・E → ローカルリレー2,
// F・G・H・I → それぞれ別の架空リレー (7001〜7004)
//
// **D だけ 1031 ではなく 1032。** `secretKey` は `% 255` を通すため、シード
// 空間の実効幅は 255 しかない。1031 は 1031 % 255 === 11 で、
// e2e/fixtures/seed-outbox.ts の viewer (secretKey(11)) と mod が一致し、
// 同じ秘密鍵 (= 同じ pubkey) を生成してしまっていた (Task 4 fix round 1
// で発覚)。1032 はどの既存フィクスチャの mod 255 とも衝突しない。
// e2e/fixtures/fixture-pubkeys.test.ts がこの手のシード帯の衝突を
// 機械的に検出する。
const authorSecretKeys = {
  A: secretKey(1001),
  B: secretKey(1011),
  C: secretKey(1021),
  D: secretKey(1032),
  E: secretKey(1041),
  F: secretKey(1051),
  G: secretKey(1061),
  H: secretKey(1071),
  I: secretKey(1081),
} as const;

type AuthorName = keyof typeof authorSecretKeys;

const authorPubkeys = Object.fromEntries(
  (Object.keys(authorSecretKeys) as AuthorName[]).map((name) => [
    name,
    getPublicKey(authorSecretKeys[name]),
  ]),
) as Record<AuthorName, string>;

export const budgetViewerPubkey = getPublicKey(viewerSecretKey);
/** 衝突検出 (fixture-pubkeys.test.ts) が全著者を見られるように export する */
export const budgetAuthorPubkeys = authorPubkeys;

const publish = async (
  relay: Relay,
  template: EventTemplate,
  key: Uint8Array,
) => {
  await relay.publish(finalizeEvent(template, key));
};

export const seedBudgetFixture = async (): Promise<void> => {
  const one = await Relay.connect(relayOneUrl);
  const two = await Relay.connect(relayTwoUrl);

  const declareWriteRelay = (author: AuthorName, writeRelayUrl: string) =>
    publish(
      one,
      {
        kind: 10002,
        created_at: now,
        tags: [["r", writeRelayUrl, "write"]],
        content: "",
      },
      authorSecretKeys[author],
    );

  // A・B・C の write はローカルリレー1 (pinned 経由で必ず選ばれる)
  await declareWriteRelay("A", relayOneUrl);
  await declareWriteRelay("B", relayOneUrl);
  await declareWriteRelay("C", relayOneUrl);
  // D・E の write はローカルリレー2 (gain=2 で貪欲に選ばれる)
  await declareWriteRelay("D", relayTwoUrl);
  await declareWriteRelay("E", relayTwoUrl);
  // F・G・H・I はそれぞれ別の架空リレー (gain=1、同点タイブレークの
  // 辞書順で先頭 2 本 = 7001・7002 だけが選ばれる)
  await declareWriteRelay("F", fakeRelayUrls[0]);
  await declareWriteRelay("G", fakeRelayUrls[1]);
  await declareWriteRelay("H", fakeRelayUrls[2]);
  await declareWriteRelay("I", fakeRelayUrls[3]);

  // 閲覧者のフォローリスト — 9 人全員
  await publish(
    one,
    {
      kind: 3,
      created_at: now,
      tags: (Object.keys(authorSecretKeys) as AuthorName[]).map((name) => [
        "p",
        authorPubkeys[name],
      ]),
      content: "",
    },
    viewerSecretKey,
  );

  // 投稿はリレー1 に A の 1 件、リレー2 に D の 1 件だけ
  await publish(
    one,
    {
      kind: 1,
      created_at: now + 10,
      tags: [],
      content: budgetNoteOneText,
    },
    authorSecretKeys.A,
  );
  await publish(
    two,
    {
      kind: 1,
      created_at: now + 20,
      tags: [],
      content: budgetNoteTwoText,
    },
    authorSecretKeys.D,
  );

  one.close();
  two.close();
  console.log(
    `[streets seed:budget] relay1=${relayOneUrl} relay2=${relayTwoUrl}`,
  );
};

if (import.meta.url === `file://${process.argv[1]}`) {
  await seedBudgetFixture();
}
