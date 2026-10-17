import type { RelayUrl } from "../../relay/relay-connection";
import type { NostrEvent } from "../event";
import type { EventDraft } from "./draft";

/**
 * NIP-70 の印。付いたイベントは作者しかリレーへ出せない。印は `["-"]` と決まって
 * いるが、値の付いたものも保護とみなす —— 埋め込まなくても取りに行けば読める一方、
 * 埋め込んで断られるとリポストそのものが届かない。
 */
const isProtected = (event: NostrEvent): boolean =>
  event.tags.some((tag) => tag[0] === "-");

/**
 * NIP-18 のリポスト。`kind:1` 以外は `undefined`（NIP-18 は kind:16 が別
 * 用途で、kind:6 に他 kind を入れるのは違反。kind:16 は使う面がまだ無い）。
 *
 * `e` タグは NIP-01 の `["e", id, relay, pubkey]`。返信ではないので NIP-10 の
 * 印の位置を空けない —— 空けると、NIP-01 どおりに読む側には作者が `""` に見える。
 */
export const buildRepost = (
  target: NostrEvent,
  options?: { relayHint?: RelayUrl },
): EventDraft | undefined => {
  if (target.kind !== 1) return undefined;
  return {
    kind: 6,
    // NIP-18: "The content of a repost event is the stringified JSON of the reposted note."
    // NIP-70: "Reposts of protected events MUST NOT embed the reposted event."
    // 埋め込むと、作者以外が出せないはずのイベントを他のリレーへ運ぶことになり、リレーにも断られる。
    content: isProtected(target) ? "" : JSON.stringify(target),
    tags: [
      ["e", target.id, options?.relayHint ?? "", target.pubkey],
      ["p", target.pubkey],
    ],
  };
};
