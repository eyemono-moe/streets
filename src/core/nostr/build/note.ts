import type { RelayUrl } from "../../relay/relay-connection";
import type { NostrEvent } from "../event";
import { encodeBech32 } from "../nip19";
import type { EventDraft } from "./draft";

/** 親が持つ `root` マーカー付きの `e` タグ。無ければ親自身が根。 */
const rootTagOf = (parent: NostrEvent): string[] | undefined =>
  parent.tags.find((tag) => tag[0] === "e" && tag[3] === "root");

/**
 * NIP-10 の返信。マーカー付き `e` タグ `["e", id, relay-url, marker, pubkey]`
 * を使う（positional 形式は NIP-10 で deprecated）。relay-url が無くても空文字
 * で埋める —— 省略すると marker が relay-url 位置にずれ "root" へ接続される。
 * 自分を `p` から落とさない（`pubkey` 未受領で判定不能、実害は小さい）。
 */
export const buildReply = (
  parent: NostrEvent,
  content: string,
  options?: { relayHint?: RelayUrl },
): EventDraft => {
  const hint = options?.relayHint ?? "";
  const root = rootTagOf(parent);

  // NIP-10: "A direct reply to the root of a thread should have a single marked 'e' tag of type 'root'."
  const e = root
    ? [root, ["e", parent.id, hint, "reply", parent.pubkey]]
    : [["e", parent.id, hint, "root", parent.pubkey]];

  // NIP-10: "the reply event's 'p' tags should contain all of E's 'p' tags as well as the pubkey of the event being replied to."
  const pubkeys = new Set<string>([parent.pubkey]);
  for (const tag of parent.tags) {
    if (tag[0] === "p" && tag[1]) pubkeys.add(tag[1]);
  }

  return {
    kind: 1,
    tags: [...e, ...[...pubkeys].map((pubkey) => ["p", pubkey])],
    content,
  };
};

/**
 * NIP-18 の引用。`e` タグは立てない（NIP-18: "quote reposts will not be shown
 * in the feed as replies"）。`nevent` は使わない（`nip19.ts` は復号専用で TLV
 * 符号化器が無い）—— `note` で参照し、リレーヒントは `q` タグの 3 番目に持たせる。
 */
export const buildQuote = (
  target: NostrEvent,
  content: string,
  options?: { relayHint?: RelayUrl },
): EventDraft => {
  const uri = `nostr:${encodeBech32("note", target.id)}`;
  return {
    kind: 1,
    tags: [
      ["q", target.id, options?.relayHint ?? "", target.pubkey],
      ["p", target.pubkey],
    ],
    content: content.includes(uri) ? content : `${content}\n\n${uri}`,
  };
};
