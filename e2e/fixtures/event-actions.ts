import type { EventTemplate } from "nostr-tools";
import { finalizeEvent, getPublicKey } from "nostr-tools/pure";

const secretKey = (seed: number) =>
  Uint8Array.from(
    Array.from({ length: 32 }, (_, i) => ((seed + i * 7) % 255) + 1),
  );

const viewerSecretKey = secretKey(70_402);
const targetAuthorSecretKey = secretKey(70_502);

export const eventActionViewerPubkey = getPublicKey(viewerSecretKey);
export const eventActionTargetAuthorPubkey = getPublicKey(
  targetAuthorSecretKey,
);
export const eventActionTargetText = "streets event action target";

export const signAsEventActionViewer = (template: EventTemplate) =>
  finalizeEvent(template, viewerSecretKey);

export const signAsEventActionTargetAuthor = (template: EventTemplate) =>
  finalizeEvent(template, targetAuthorSecretKey);
