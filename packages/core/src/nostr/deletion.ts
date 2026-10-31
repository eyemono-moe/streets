/**
 * NIP-09 の削除依頼（kind:5）。
 *
 * - 対象を `e` / `a` で並べる（"having a list of one or more `e` or `a` tags, each
 *   referencing an event the author is requesting to be deleted"）
 * - 対象の kind を `k` に入れる（"Deletion requests SHOULD include a `k` tag for the kind of
 *   each event being requested for deletion"）
 * - `a` で指したときは、削除依頼の `created_at` までの版が消える（"When an `a` tag is used,
 *   relays SHOULD delete all versions of the replaceable event up to the `created_at`
 *   timestamp of the deletion request event"）
 * - 読む側は、対象の作者と削除依頼の作者が同じことを確かめてから隠す（"A client MUST validate
 *   that each event `pubkey` referenced in the `e` tag of the deletion request is identical to
 *   the deletion request `pubkey`, before hiding or deleting any event"）。対象を持っていない
 *   と確かめられないので、作者の照合は store が行う
 */
import { type EventAddress, isAddressableKind } from "./address";
import type { EventDraft } from "./build/draft";
import type { NostrEvent } from "./event";

export const DELETION_KIND = 5;
const HEX_64 = /^[0-9a-f]{64}$/;
const CANONICAL_DECIMAL = /^(?:0|[1-9]\d*)$/;

/**
 * `target.pubkey` が閲覧者本人でないときに呼んではならない —— `pubkey` を受け取らず
 * 判定できないため、検査は呼び出し側の責務。
 * 置換できるイベントは `a` でも指す。`e` だけでは、その版しか消えず、
 * 別のリレーに残る古い版や、後から届く同じ版が生き返る。`d` の無い壊れたものも、
 * store と同じく空の `d` として指す。
 */
export const buildDeletion = (target: NostrEvent): EventDraft => {
  const identifier = target.tags.find((tag) => tag[0] === "d")?.[1] ?? "";
  return {
    kind: DELETION_KIND,
    tags: [
      ["e", target.id],
      ...(isAddressableKind(target.kind)
        ? [["a", `${target.kind}:${target.pubkey}:${identifier}`]]
        : []),
      ["k", String(target.kind)],
    ],
    content: "",
  };
};

/** `e` で指した id。形の壊れたものは落とす。 */
export const deletionTargetIds = (deletion: NostrEvent): string[] => [
  ...new Set(
    deletion.tags
      .filter(
        (tag): tag is [string, string] =>
          tag[0] === "e" && typeof tag[1] === "string" && HEX_64.test(tag[1]),
      )
      .map((tag) => tag[1]),
  ),
];

/**
 * `a` で指した住所。削除依頼の作者と違う人の住所は、効かないので落とす。
 * `d` は `:` を含みうるので、2 つ目の `:` から後ろを丸ごと `d` とする。
 */
export const deletionTargetAddresses = (deletion: NostrEvent): EventAddress[] =>
  deletion.tags.flatMap((tag) => {
    if (tag[0] !== "a" || typeof tag[1] !== "string") return [];
    const address = parseAddress(tag[1]);
    return address && address.pubkey === deletion.pubkey ? [address] : [];
  });

const parseAddress = (raw: string): EventAddress | undefined => {
  const firstColon = raw.indexOf(":");
  const secondColon = raw.indexOf(":", firstColon + 1);
  if (firstColon <= 0 || secondColon < 0) return undefined;
  const rawKind = raw.slice(0, firstColon);
  if (!CANONICAL_DECIMAL.test(rawKind)) return undefined;
  const kind = Number(rawKind);
  const pubkey = raw.slice(firstColon + 1, secondColon);
  if (
    !Number.isInteger(kind) ||
    !isAddressableKind(kind) ||
    !HEX_64.test(pubkey)
  ) {
    return undefined;
  }
  return { kind, pubkey, identifier: raw.slice(secondColon + 1) };
};
