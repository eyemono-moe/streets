import { describe, expect, test } from "vitest";
import { budgetAuthorPubkeys, budgetViewerPubkey } from "./seed-budget.js";
import { capAuthorPubkey, capViewerPubkey } from "./seed-cap.js";
import {
  notificationAuthorPubkey,
  notificationViewerPubkey,
} from "./seed-notification.js";
import {
  intruderPubkey,
  outboxAuthorAPubkey,
  outboxAuthorBPubkey,
  outboxViewerPubkey,
} from "./seed-outbox.js";
import {
  previewAuthorOnePubkey,
  previewAuthorTwoPubkey,
  previewViewerPubkey,
} from "./seed-preview.js";
import { threadAuthorPubkey, threadViewerPubkey } from "./seed-thread.js";
import {
  e2eAuthorPubkey,
  e2eDebugFeedMissingProfilePubkeys,
  e2eDebugFeedViewerPubkey,
  e2eDebugTimelinePubkeys,
  e2eFollowerPubkey,
  e2eViewerPubkey,
} from "./seed.js";

/**
 * すべての e2e フィクスチャの秘密鍵は `((seed + i * 7) % 255) + 1` (または
 * seed.ts の一部は `* 73`) という式から決定的に組み立てている。**`% 255`
 * によりシード空間の実効幅は 255 しかない。** mod が一致する 2 つのシード
 * は同じ秘密鍵 = 同じ pubkey になる — 見た目の数字 (911 と 1031 など) が
 * 離れていても罠にかかる (Task 4 fix round 1: `secretKey(2101)` が
 * `secretKey(1081)` と衝突し、cap フィクスチャの著者が budget フィクスチャの
 * 著者 I になり代わって既存 e2e を壊していたのに、`git stash` での
 * 比較ではリレー DB 側の汚染に気付けなかった)。
 *
 * コメントで「別のシード帯を使うこと」と書くだけでは次の執筆者を止められない
 * (コメントはビルドを落とさない)。ここでは全フィクスチャが export する
 * pubkey を実際に計算し、ペアワイズで distinct であることを機械的に検証する。
 * 新しいフィクスチャを足すときは、この一覧にも追加すること。
 */
describe("e2e fixture pubkeys", () => {
  test("every fixture identity is pairwise distinct", () => {
    const entries: [string, string][] = [
      ["seed.ts:viewer", e2eViewerPubkey],
      ["seed.ts:author", e2eAuthorPubkey],
      ["seed.ts:follower", e2eFollowerPubkey],
      ...e2eDebugTimelinePubkeys.map((pubkey, i): [string, string] => [
        `seed.ts:debugTimeline[${i}]`,
        pubkey,
      ]),
      ["seed.ts:debugFeedViewer", e2eDebugFeedViewerPubkey],
      ...e2eDebugFeedMissingProfilePubkeys.map(
        (pubkey, i): [string, string] => [
          `seed.ts:debugFeedMissingProfile[${i}]`,
          pubkey,
        ],
      ),
      ["seed-outbox.ts:viewer", outboxViewerPubkey],
      ["seed-outbox.ts:authorA", outboxAuthorAPubkey],
      ["seed-outbox.ts:authorB", outboxAuthorBPubkey],
      ["seed-outbox.ts:intruder", intruderPubkey],
      ["seed-budget.ts:viewer", budgetViewerPubkey],
      ...Object.entries(budgetAuthorPubkeys).map(
        ([name, pubkey]): [string, string] => [
          `seed-budget.ts:${name}`,
          pubkey,
        ],
      ),
      ["seed-cap.ts:viewer", capViewerPubkey],
      ["seed-cap.ts:author", capAuthorPubkey],
      ["seed-notification.ts:viewer", notificationViewerPubkey],
      ["seed-notification.ts:author", notificationAuthorPubkey],
      ["seed-preview.ts:viewer", previewViewerPubkey],
      ["seed-preview.ts:authorOne", previewAuthorOnePubkey],
      ["seed-preview.ts:authorTwo", previewAuthorTwoPubkey],
      ["seed-thread.ts:viewer", threadViewerPubkey],
      ["seed-thread.ts:author", threadAuthorPubkey],
    ];

    const seenAt = new Map<string, string>();
    const collisions: string[] = [];
    for (const [label, pubkey] of entries) {
      const earlier = seenAt.get(pubkey);
      if (earlier) {
        collisions.push(`${label} === ${earlier} (pubkey ${pubkey})`);
      } else {
        seenAt.set(pubkey, label);
      }
    }

    expect(
      collisions,
      `pubkey collisions across e2e fixtures:\n${collisions.join("\n")}`,
    ).toEqual([]);
    expect(seenAt.size).toBe(entries.length);
  });
});
