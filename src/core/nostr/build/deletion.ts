import type { NostrEvent } from "../event";
import type { EventDraft } from "./draft";

/**
 * NIP-09 の削除依頼。
 *
 * **`target.pubkey` が閲覧者本人でないときに呼んではならない。** リレーは
 * pubkey が一致しない削除依頼を無視するので送っても無害だが、ビルダは
 * `pubkey` を受け取らないので自分のものかどうかを知らない。この検査は
 * `Writer` でもなく**呼び出し側**の責務。
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
