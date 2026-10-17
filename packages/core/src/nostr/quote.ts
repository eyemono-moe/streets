/**
 * NIP-18 の引用。
 *
 * - `["q", id, relay, pubkey]`、住所で指すものは `["q", "kind:pubkey:d", relay]`
 *   （"`["q", "<event-id> or <event-address>", "<relay-url>", "<pubkey-if-a-regular-event>"]`"）
 * - 本文の `nevent` / `note` / `naddr` は `q` タグにする（"Mentions to NIP-21 entities
 *   like nevent, note and naddr on any event must be converted into q tags"）
 * - `e` タグは立てない（"The `q` tag ensures quote reposts are not pulled and included
 *   as replies in threads"）
 */
import type { RelayUrl } from "../relay/relay-connection";
import { addressOfEvent, formatEventAddress } from "./address";
import type { EventDraft } from "./build/draft";
import { hashtagTags } from "./build/note";
import { parseContent } from "./content";
import type { NostrEvent } from "./event";
import { encodeEventPointer, pointsTo } from "./event-pointer";
import { type EventRef, idRef, relayOf } from "./event-refs";

/**
 * 引用先を順に返す。`e` タグは拾わない —— NIP-18 が `q` タグを作った目的は
 * 「引用をスレッドの返信として現れさせない」ことなので、混ぜると逆流する。
 */
export const quoteTargets = (event: NostrEvent): EventRef[] => {
  const refs: EventRef[] = [];
  for (const tag of event.tags) {
    if (tag[0] !== "q") continue;
    const value = tag[1] ?? "";
    if (value.includes(":")) {
      const ref: EventRef = { form: "address", address: value };
      const r = relayOf(tag[2]);
      if (r) ref.relay = r;
      refs.push(ref);
      continue;
    }
    const ref = idRef(value, tag[2], tag[3]);
    if (ref) refs.push(ref);
  }
  return refs;
};

/**
 * `q` タグのうち本文に `nostr:` として現れないものを返す（本文側は
 * `NoteContent` の `eventRefs` が描画）。NIP-18 は本文言及の `q` タグ化を
 * MUST、NIP-27 は任意とし本文とタグが双方向にずれるため「タグにしか
 * 無いもの」を出し、id/address（naddr の 3 つ組と一致）とも重複は先勝ち。
 */
export const tagOnlyQuoteTargets = (event: NostrEvent): EventRef[] => {
  const mentionedIds = new Set<string>();
  const mentionedAddresses = new Set<string>();
  for (const token of parseContent(event.content, event.tags)) {
    if (token.type !== "mention") continue;
    const ref = token.ref;
    if (ref.kind === "note" || ref.kind === "nevent") {
      mentionedIds.add(ref.id);
    } else if (ref.kind === "naddr") {
      mentionedAddresses.add(
        `${ref.eventKind}:${ref.pubkey}:${ref.identifier}`,
      );
    }
  }

  const seenIds = new Set<string>();
  const seenAddresses = new Set<string>();
  const refs: EventRef[] = [];
  for (const ref of quoteTargets(event)) {
    if (ref.form === "id") {
      if (mentionedIds.has(ref.id) || seenIds.has(ref.id)) continue;
      seenIds.add(ref.id);
    } else {
      if (
        mentionedAddresses.has(ref.address) ||
        seenAddresses.has(ref.address)
      ) {
        continue;
      }
      seenAddresses.add(ref.address);
    }
    refs.push(ref);
  }
  return refs;
};

/**
 * 住所を持つ先は `q` も住所で指す —— 本文の `naddr` と揃えないと、読む側で
 * 同じ引用が 2 つ描かれる。
 *
 * 引用先の作者への `p` はここでは付けない。本文で引用したものと同じく、
 * `withReferences` が設定に従って `q` から付ける。
 */
export const buildQuote = (
  target: NostrEvent,
  content: string,
  options?: { relayHint?: RelayUrl },
): EventDraft => {
  const hint = options?.relayHint ?? "";
  const address = addressOfEvent(target);
  const q = address
    ? ["q", formatEventAddress(address), hint]
    : ["q", target.id, hint, target.pubkey];
  // 貼り付けたリンクはリレーの違いで文字列が変わるので、指している先で比べる。
  const quoted = parseContent(content, []).some(
    (token) => token.type === "mention" && pointsTo(token.ref, target),
  );
  const uri = `nostr:${encodeEventPointer(target, hint ? [hint] : [])}`;
  return {
    kind: 1,
    tags: [q, ...hashtagTags(content)],
    content: quoted ? content : `${content}\n\n${uri}`,
  };
};
