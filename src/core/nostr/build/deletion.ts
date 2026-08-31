import type { NostrEvent } from "../event";
import type { EventDraft } from "./draft";

/**
 * NIP-09 の削除依頼。`target.pubkey` が閲覧者本人でないときに呼んではならない
 * —— ビルダは `pubkey` を受け取らず判定できないため、検査は呼び出し側の責務。
 */
export const buildDeletion = (
  target: NostrEvent,
  reason?: string,
): EventDraft => ({
  kind: 5,
  tags: [
    ["e", target.id],
    ["k", String(target.kind)],
  ],
  content: reason ?? "",
});
