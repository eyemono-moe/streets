import { addressOfNaddr, formatEventAddress } from "../nostr/address";
import { type EventRef, relayOf } from "../nostr/event-refs";
import { decodeNip19 } from "../nostr/nip19";

/**
 * 長文記事の段落を、埋め込み（引用カード）にする参照か。段落がイベントへの参照
 * 1 つだけのときに限る —— 文の途中の参照までカードにすると、本文の流れが切れる。
 * 人（npub）は名前として描くので、ここでは扱わない。
 */
export const articleEmbedOf = (paragraph: string): EventRef | undefined => {
  const text = paragraph.trim().replace(/^nostr:/, "");
  if (!/^(note|nevent|naddr)1[0-9a-z]+$/.test(text)) return undefined;
  const ref = decodeNip19(text);
  if (!ref) return undefined;
  if (ref.kind === "note") return { form: "id", id: ref.id };
  if (ref.kind === "nevent") {
    const relay = relayOf(ref.relays[0]);
    return relay
      ? { form: "id", id: ref.id, relay }
      : { form: "id", id: ref.id };
  }
  if (ref.kind === "naddr") {
    const address = addressOfNaddr(ref);
    if (!address) return undefined;
    const relay = relayOf(ref.relays[0]);
    const value = formatEventAddress(address);
    return relay
      ? { form: "address", address: value, relay }
      : { form: "address", address: value };
  }
  return undefined;
};
