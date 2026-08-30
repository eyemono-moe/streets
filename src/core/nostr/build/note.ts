import type { RelayUrl } from "../../relay/relay-connection";
import type { NostrEvent } from "../event";
import { encodeBech32 } from "../nip19";
import type { EventDraft } from "./draft";

/** 親が持つ `root` マーカー付きの `e` タグ。無ければ親自身が根。 */
const rootTagOf = (parent: NostrEvent): string[] | undefined =>
  parent.tags.find((tag) => tag[0] === "e" && tag[3] === "root");

/**
 * NIP-10 の返信。**マーカー付きの `e` タグ**を使う (positional 形式は
 * NIP-10 が deprecated としている)。位置要素は
 * `["e", <event-id>, <relay-url>, <marker>, <pubkey>]` の 5 つで、
 * relay-url が無くても**空文字で埋める** —— 省略するとマーカーが
 * relay-url の位置に来て、読む側が "root" というリレーへ繋ごうとする。
 *
 * 自分自身を `p` から落とす処理は入れない。ビルダは `pubkey` を受け取ら
 * ないので誰が自分か知らない。自分への通知は他クライアントも普通に付けて
 * おり、害が小さい。
 */
export const buildReply = (
  parent: NostrEvent,
  content: string,
  options?: { relayHint?: RelayUrl },
): EventDraft => {
  const hint = options?.relayHint ?? "";
  const root = rootTagOf(parent);

  // NIP-10: "A direct reply to the root of a thread should have a single
  // marked 'e' tag of type 'root'."
  const e = root
    ? [root, ["e", parent.id, hint, "reply", parent.pubkey]]
    : [["e", parent.id, hint, "root", parent.pubkey]];

  // NIP-10: "the reply event's 'p' tags should contain all of E's 'p' tags
  // as well as the pubkey of the event being replied to."
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
 * NIP-18 の引用。**`e` タグを立てない** —— NIP-18 は
 * "This ensures that quote reposts will not be shown in the feed as replies"
 * と明示しており、立てると引用が返信としてタイムラインに出る。
 *
 * `nevent` (リレーヒントと著者を TLV で持つ形) は使わない ——
 * `src/core/nostr/nip19.ts` は復号と素の bech32 しか持たず、TLV の
 * 符号化器がまだ無い。`note` でも参照としては一意に定まり、リレーヒントは
 * `q` タグの 3 番目が持つ。
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
