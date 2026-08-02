import { type EventTemplate, Relay } from "nostr-tools";
import { finalizeEvent, getPublicKey } from "nostr-tools/pure";

export const relayOneUrl =
  process.env.STREETS_E2E_RELAY_URL ?? "ws://127.0.0.1:8080";
export const relayTwoUrl =
  process.env.STREETS_E2E_RELAY_2_URL ?? "ws://127.0.0.1:8081";

export const outboxNoteAText = "outbox author A note";
export const outboxNoteBText = "outbox author B note";

const now = 1_735_689_600;

const secretKey = (seed: number) =>
  Uint8Array.from(
    Array.from({ length: 32 }, (_, i) => ((seed + i * 7) % 255) + 1),
  );

const viewerSecretKey = secretKey(11);
const authorASecretKey = secretKey(101);
const authorBSecretKey = secretKey(211);

export const outboxViewerPubkey = getPublicKey(viewerSecretKey);
export const outboxAuthorAPubkey = getPublicKey(authorASecretKey);
export const outboxAuthorBPubkey = getPublicKey(authorBSecretKey);

const publish = async (
  relay: Relay,
  template: EventTemplate,
  key: Uint8Array,
) => {
  await relay.publish(finalizeEvent(template, key));
};

export const seedOutboxFixture = async (): Promise<void> => {
  const one = await Relay.connect(relayOneUrl);
  const two = await Relay.connect(relayTwoUrl);

  // 著者 A の kind:10002 — write は リレー1
  await publish(
    one,
    {
      kind: 10002,
      created_at: now,
      tags: [["r", relayOneUrl, "write"]],
      content: "",
    },
    authorASecretKey,
  );

  // 著者 B の kind:10002 — write は リレー2。これが無いと B は取れない
  await publish(
    one,
    {
      kind: 10002,
      created_at: now,
      tags: [["r", relayTwoUrl, "write"]],
      content: "",
    },
    authorBSecretKey,
  );

  // 閲覧者のフォローリスト
  await publish(
    one,
    {
      kind: 3,
      created_at: now,
      tags: [
        ["p", outboxAuthorAPubkey],
        ["p", outboxAuthorBPubkey],
      ],
      content: "",
    },
    viewerSecretKey,
  );

  // 著者 A の投稿はリレー1 だけ
  await publish(
    one,
    { kind: 1, created_at: now + 10, tags: [], content: outboxNoteAText },
    authorASecretKey,
  );

  // 著者 B の投稿はリレー2 だけ。ルーティングが効かなければ取得できない
  await publish(
    two,
    { kind: 1, created_at: now + 20, tags: [], content: outboxNoteBText },
    authorBSecretKey,
  );

  one.close();
  two.close();
  console.log(
    `[streets seed:outbox] relay1=${relayOneUrl} relay2=${relayTwoUrl}`,
  );
};

/**
 * 著者 B としてリレー2 へ 1 通発行する。`seedOutboxFixture` と違い
 * **テストの実行中に**呼ぶためのもの (e2e/relay-recovery.spec.ts)。
 *
 * `created_at` は固定の `now` ではなく実時間を使う。リレーの DB は
 * `./data/nostr-rs-relay-2/db` に永続するので、内容も呼び出し側が
 * 実行ごとに変えないと、2 回目以降の実行では「切断中に発行したはずの
 * 投稿」が最初から取得できてしまい、復帰の主張が自明に通ってしまう。
 */
export const publishNoteAsAuthorB = async (content: string): Promise<void> => {
  const two = await Relay.connect(relayTwoUrl);
  await publish(
    two,
    {
      kind: 1,
      created_at: Math.floor(Date.now() / 1000),
      tags: [],
      content,
    },
    authorBSecretKey,
  );
  two.close();
};

if (import.meta.url === `file://${process.argv[1]}`) {
  await seedOutboxFixture();
}

const intruderSecretKey = secretKey(307);
export const intruderNoteText = "intruder note the section never asked for";

/**
 * 閲覧者がフォローしていない著者の、**正当な署名つき** kind:1。
 *
 * 署名を本物にするのが要点である。無効な署名だと `EventStore.put` の schnorr
 * 検証が先に弾いてしまい、**照合器が効いたのかどうか区別できない。**
 * リレーへは publish しない —— 実リレーはフィルタを守るので、この経路では
 * 「要求していないものが届く」を再現できない。
 */
export const makeIntruderNote = () =>
  finalizeEvent(
    {
      kind: 1,
      created_at: Math.floor(Date.now() / 1000),
      tags: [],
      content: intruderNoteText,
    },
    intruderSecretKey,
  );
