import type { NostrEvent } from "../nostr/event";
import type { RelayUrl } from "../relay/relay-connection";
import { normalizeRelayUrl } from "../relay/relay-url";
import type { EventStore } from "./event-store";
import type { RoutingTable } from "./routing-table";

/**
 * そのイベントを受け取ったリレー。書いたばかりの投稿の `local` のような、
 * リレーでない印は落とす。
 */
export const relaysSeenOn = (
  store: Pick<EventStore, "seenRelays">,
  id: string,
): RelayUrl[] =>
  store
    .seenRelays(id)
    .map(normalizeRelayUrl)
    .filter((relay) => relay !== undefined);

/**
 * そのイベントを指すタグに添えるリレー。受け取ったリレーが分からないもの
 * （埋め込みから入ったリポスト元など）は、作者の書き込みリレーにする。
 * 空のままにしないのは、NIP-18 がリポストにリレーを MUST としているのと、
 * 読む側が作者の kind:10002 を持っていなくても辿れるようにするため。
 */
export const relayHintFor = (
  store: EventStore,
  routing: Pick<RoutingTable, "writeRelaysFor">,
  event: NostrEvent,
): RelayUrl | undefined =>
  relaysSeenOn(store, event.id)[0] ?? routing.writeRelaysFor(event.pubkey)[0];
