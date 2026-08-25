import { type EventTemplate, Relay } from "nostr-tools";
import { finalizeEvent, getPublicKey } from "nostr-tools/pure";

export const notificationRelayUrl =
  process.env.STREETS_E2E_RELAY_URL ?? "ws://127.0.0.1:8080";

const now = 1_735_689_600;

// 秘密鍵は `((seed + i * 7) % 255) + 1` から決定的に組み立てる。
// **`% 255` によりシード空間の実効幅は 255 しかない** ので、既存
// フィクスチャと mod 255 が衝突しない値を選ぶ (110_000 % 255 = 95,
// 110_100 % 255 = 195 — どちらも使用済みの集合に無い)。
// fixture-pubkeys.test.ts が pairwise distinctness を機械的に検証する。
const secretKey = (seed: number) =>
  Uint8Array.from(
    Array.from({ length: 32 }, (_, i) => ((seed + i * 7) % 255) + 1),
  );

const viewerSecretKey = secretKey(110_000);
const authorSecretKey = secretKey(110_100);

export const notificationViewerPubkey = getPublicKey(viewerSecretKey);
export const notificationAuthorPubkey = getPublicKey(authorSecretKey);

export const notificationOwnNoteText = "streets notification e2e own note";
export const notificationReplyText = "streets notification e2e reply";

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
 * 通知カラムのフィクスチャ。
 *
 * **閲覧者の kind:10002 をこのリレーへ read として置くのが要**。ただし
 * これは接続先の選択そのものを検証するためではない —— `DeckColumn.tsx` の
 * `?relays=` 上書きは `resolved.relays` があれば常に無条件でローカル
 * リレーへ差し替えるので、通知カラムは常にその上書き対象になり、
 * `resolveSource` が何を返しても e2e の結果は変わらない (リレー選択の
 * 検証は `resolve-source.test.ts` の担当)。ここで kind:10002 を置く理由は、
 * 「リレー設定 (kind:10002) が見つからない」という `columnAlerts` の警告を
 * 光らせないため。
 *
 * **閲覧者自身のリアクションを 1 件混ぜている**。「自分の行動が出ない」の
 * 主張は、他人の同じ形のリアクションが同じ画面に出ていることと対にして
 * 初めて証拠になる —— 片側だけだと、カラムが空でもテストが通る。
 */
export const seedNotificationFixture = async (): Promise<void> => {
  const relay = await Relay.connect(notificationRelayUrl);
  try {
    await publishAndReturn(
      relay,
      {
        kind: 10002,
        created_at: now,
        tags: [["r", notificationRelayUrl, "read"]],
        content: "",
      },
      viewerSecretKey,
    );

    const ownNote = await publishAndReturn(
      relay,
      {
        kind: 1,
        created_at: now + 1,
        tags: [],
        content: notificationOwnNoteText,
      },
      viewerSecretKey,
    );

    // 他人からの返信 (kind:1)
    await publishAndReturn(
      relay,
      {
        kind: 1,
        created_at: now + 2,
        tags: [
          ["e", ownNote.id, notificationRelayUrl, "root"],
          ["p", notificationViewerPubkey],
        ],
        content: notificationReplyText,
      },
      authorSecretKey,
    );

    // 他人からのリアクション (kind:7)
    await publishAndReturn(
      relay,
      {
        kind: 7,
        created_at: now + 3,
        tags: [
          ["e", ownNote.id, notificationRelayUrl],
          ["p", notificationViewerPubkey],
        ],
        content: "+",
      },
      authorSecretKey,
    );

    // 他人からのリポスト (kind:6)
    await publishAndReturn(
      relay,
      {
        kind: 6,
        created_at: now + 4,
        tags: [
          ["e", ownNote.id, notificationRelayUrl],
          ["p", notificationViewerPubkey],
        ],
        content: JSON.stringify(ownNote),
      },
      authorSecretKey,
    );

    // 閲覧者自身のリアクション —— 除外されるべきもの。
    await publishAndReturn(
      relay,
      {
        kind: 7,
        created_at: now + 5,
        tags: [
          ["e", ownNote.id, notificationRelayUrl],
          ["p", notificationViewerPubkey],
        ],
        content: "🚫",
      },
      viewerSecretKey,
    );
  } finally {
    relay.close();
  }
};
