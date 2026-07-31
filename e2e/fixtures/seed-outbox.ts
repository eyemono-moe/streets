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

if (import.meta.url === `file://${process.argv[1]}`) {
  await seedOutboxFixture();
}
