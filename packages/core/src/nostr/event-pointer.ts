import { addressOfEvent, addressOfNaddr, formatEventAddress } from "./address";
import type { NostrEvent } from "./event";
import {
  type Nip19Ref,
  encodeBech32,
  encodeNaddr,
  encodeNevent,
} from "./nip19";

/** 添えるリレーの数。多いと文字列が長くなるだけで、探す手がかりは増えない。 */
const MAX_RELAY_HINTS = 2;

/**
 * 投稿を指す NIP-19 の文字列（`nostr:` は付けない）。住所を持つもの（長文記事など）
 * は `naddr` にして、書き直された後も最新の版を指す。それ以外は `nevent` に作者と
 * 種類を添える —— 読む側が、添えたリレーと作者のリレーから投稿を探せる。
 */
export const encodeEventPointer = (
  event: NostrEvent,
  relays: readonly string[] = [],
): string => {
  const hints = relays.slice(0, MAX_RELAY_HINTS);
  const address = addressOfEvent(event);
  const encoded = address
    ? encodeNaddr({
        identifier: address.identifier,
        pubkey: address.pubkey,
        eventKind: address.kind,
        relays: hints,
      })
    : encodeNevent({
        id: event.id,
        author: event.pubkey,
        eventKind: event.kind,
        relays: hints,
      });
  return encoded ?? encodeBech32("note", event.id);
};

/** 本文の参照がその投稿を指しているか。住所を持つ投稿は、id でも住所でも指せる。 */
export const pointsTo = (ref: Nip19Ref, event: NostrEvent): boolean => {
  switch (ref.kind) {
    case "note":
    case "nevent":
      return ref.id === event.id;
    case "naddr": {
      const address = addressOfEvent(event);
      const target = addressOfNaddr(ref);
      return (
        address !== undefined &&
        target !== undefined &&
        formatEventAddress(address) === formatEventAddress(target)
      );
    }
    default:
      return false;
  }
};
