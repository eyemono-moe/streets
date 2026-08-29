import type { EventTemplate } from "nostr-tools";
import { finalizeEvent, getPublicKey } from "nostr-tools/pure";

export const deletionRelayUrl =
  process.env.STREETS_E2E_RELAY_URL ?? "ws://127.0.0.1:8080";

// 実効シード空間が 255 しかないため、既存フィクスチャと異なる帯を使う。
const secretKey = (seed: number) =>
  Uint8Array.from(
    Array.from({ length: 32 }, (_, i) => ((seed + i * 7) % 255) + 1),
  );

const viewerSecretKey = secretKey(130_000);
const authorSecretKey = secretKey(130_100);
const forgedAuthorSecretKey = secretKey(130_200);

export const deletionViewerPubkey = getPublicKey(viewerSecretKey);
export const deletionAuthorPubkey = getPublicKey(authorSecretKey);
export const deletionForgedAuthorPubkey = getPublicKey(forgedAuthorSecretKey);

export const signAsDeletionAuthor = (template: EventTemplate) =>
  finalizeEvent(template, authorSecretKey);
export const signAsForgedDeletionAuthor = (template: EventTemplate) =>
  finalizeEvent(template, forgedAuthorSecretKey);
