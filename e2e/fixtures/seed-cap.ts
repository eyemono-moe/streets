import { type EventTemplate, Relay } from "nostr-tools";
import { finalizeEvent, getPublicKey } from "nostr-tools/pure";

export const relayOneUrl =
  process.env.STREETS_E2E_RELAY_URL ?? "ws://127.0.0.1:8080";

/** MAX_ITEMS_PER_SECTION (src/core/read/source.ts) + 100 */
const NOTE_COUNT = 600;

const now = 1_735_689_600;

// kind:3 / kind:10002 は NIP-01 の replaceable event で、同じ created_at
// 同士では先着が残ってしまう。このシード帯 (secretKey(2001) /
// secretKey(2101)) の pubkey に対して、別内容の replaceable event が
// (このタスクの試行錯誤の過程で) 同じ `now` で既に残っていたことがあり、
// 使い回すとそれが生き残って意図した r タグに置き換わらなかった。
// kind:1 は非 replaceable なので `now` をそのまま使い回しても問題ない
// (id が一致すれば単純に重複として弾かれるだけ) が、kind:3 / kind:10002
// だけは確実に上書きされるよう別の (より新しい) created_at を使う。
const profileNow = 1_740_000_000;

// e2e/fixtures/seed-outbox.ts と同じ鍵生成の作りだが、既存フィクスチャの
// pubkey と衝突しないよう別のシード帯を使う。
const secretKey = (seed: number) =>
  Uint8Array.from(
    Array.from({ length: 32 }, (_, i) => ((seed + i * 7) % 255) + 1),
  );

const viewerSecretKey = secretKey(2001);
const authorSecretKey = secretKey(2101);

export const capViewerPubkey = getPublicKey(viewerSecretKey);
export const capAuthorPubkey = getPublicKey(authorSecretKey);

const publish = async (
  relay: Relay,
  template: EventTemplate,
  key: Uint8Array,
) => {
  await relay.publish(finalizeEvent(template, key));
};

/**
 * `MAX_ITEMS_PER_SECTION + 100` = 600 件の kind:1 を著者 1 人からリレー1 へ
 * 発行し、その著者だけをフォローする閲覧者の kind:3 と、著者の kind:10002
 * (write = リレー1) も発行する。
 *
 * **リレーの DB は `data/` に永続し、global setup は実行のたびに走る。**
 * 二重に seed して 1200 件にならないよう、`created_at` と本文を index から
 * 決定的に組み立てている — イベント id は署名ではなくシリアライズされた
 * (kind, pubkey, created_at, tags, content) のハッシュなので、これらが
 * 同じなら再実行しても同じ id が再生成され、リレーは重複として弾く。
 */
export const seedCapFixture = async (): Promise<void> => {
  const relay = await Relay.connect(relayOneUrl);

  // 著者の kind:10002 — write はリレー1
  await publish(
    relay,
    {
      kind: 10002,
      created_at: profileNow,
      tags: [["r", relayOneUrl, "write"]],
      content: "",
    },
    authorSecretKey,
  );

  // 閲覧者のフォローリスト — 著者 1 人だけ
  await publish(
    relay,
    {
      kind: 3,
      created_at: profileNow,
      tags: [["p", capAuthorPubkey]],
      content: "",
    },
    viewerSecretKey,
  );

  // 著者の kind:1 を 600 件。created_at と content を index から決定的に
  // 組み立てることで、再 seed しても同じ id が再生成される。
  for (let i = 0; i < NOTE_COUNT; i++) {
    await publish(
      relay,
      {
        kind: 1,
        created_at: now + 10 + i,
        tags: [],
        content: `cap note ${i}`,
      },
      authorSecretKey,
    );
  }

  relay.close();
  console.log(`[streets seed:cap] relay1=${relayOneUrl} notes=${NOTE_COUNT}`);
};

if (import.meta.url === `file://${process.argv[1]}`) {
  await seedCapFixture();
}
