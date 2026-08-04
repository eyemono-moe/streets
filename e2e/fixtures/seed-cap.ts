import { type EventTemplate, Relay } from "nostr-tools";
import { finalizeEvent, getPublicKey } from "nostr-tools/pure";

export const relayOneUrl =
  process.env.STREETS_E2E_RELAY_URL ?? "ws://127.0.0.1:8080";

/** MAX_ITEMS_PER_SECTION (src/core/read/source.ts) + 100 */
const NOTE_COUNT = 600;

const now = 1_735_689_600;

// e2e/fixtures/seed-outbox.ts と同じ鍵生成の作りだが、既存フィクスチャの
// pubkey と衝突しないよう別のシード帯を使う。
//
// **`% 255` によりシード空間の実効幅は 255 しかない。** 同じ mod を持つ
// シード同士は同じ秘密鍵 (= 同じ pubkey) になる。当初 secretKey(2001) /
// secretKey(2101) を選んだが、2101 % 255 === 61 が
// e2e/fixtures/seed-budget.ts の著者 I (secretKey(1081)、1081 % 255 も 61)
// と一致しており、著者 pubkey が丸ごと衝突していた (Task 4 fix round 1 で
// 発覚)。50000 / 51000 はどの既存フィクスチャの mod 255 とも pubkey とも
// 衝突しないことを確認済み — e2e/fixtures/fixture-pubkeys.test.ts が
// 今後の再発を機械的に検出する。
const secretKey = (seed: number) =>
  Uint8Array.from(
    Array.from({ length: 32 }, (_, i) => ((seed + i * 7) % 255) + 1),
  );

const viewerSecretKey = secretKey(50000);
const authorSecretKey = secretKey(51000);

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
      created_at: now,
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
      created_at: now,
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
