import type { NostrEvent } from "../event";
import type { EventDraft } from "./draft";

const isAddressable = (kind: number) => kind >= 30_000 && kind < 40_000;

/**
 * NIP-09 の削除依頼。`target.pubkey` が閲覧者本人でないときに呼んではならない
 * —— ビルダは `pubkey` を受け取らず判定できないため、検査は呼び出し側の責務。
 * 置換できるイベントは `a` でも指す。`e` だけでは、その版しか消えず、
 * 別のリレーに残る古い版や、後から届く同じ版が生き返る。
 */
export const buildDeletion = (
  target: NostrEvent,
  reason?: string,
): EventDraft => {
  const identifier = target.tags.find((tag) => tag[0] === "d")?.[1] ?? "";
  return {
    kind: 5,
    tags: [
      ["e", target.id],
      ...(isAddressable(target.kind)
        ? [["a", `${target.kind}:${target.pubkey}:${identifier}`]]
        : []),
      ["k", String(target.kind)],
    ],
    content: reason ?? "",
  };
};
