import type { RelayUrl } from "../../relay/relay-connection";
import type { NostrEvent } from "../event";
import type { EventDraft } from "./draft";

/**
 * NIP-18 のリポスト。`kind:1` 以外は `undefined`（NIP-18 は kind:16 が別
 * 用途で、kind:6 に他 kind を入れるのは違反。kind:16 は使う面がまだ無い）。
 */
export const buildRepost = (
  target: NostrEvent,
  options?: { relayHint?: RelayUrl },
): EventDraft | undefined => {
  if (target.kind !== 1) return undefined;
  return {
    kind: 6,
    // NIP-18: "The content of a repost event is the stringified JSON of the reposted note."
    content: JSON.stringify(target),
    tags: [
      // NIP-18 はリレー URL を 3 番目に置くよう定める。マーカー位置 (4 番目) は空文字で埋め、著者を 5 番目に置く
      ["e", target.id, options?.relayHint ?? "", "", target.pubkey],
      ["p", target.pubkey],
    ],
  };
};
