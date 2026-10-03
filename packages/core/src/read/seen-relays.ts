import type { RelayUrl } from "../relay/relay-connection";
import { normalizeRelayUrl } from "../relay/relay-url";
import type { EventStore } from "./event-store";

/**
 * そのイベントを受け取ったリレー。書いたばかりの投稿の `local` のような、
 * リレーでない印は落とす。
 */
export const relaysSeenOn = (store: EventStore, id: string): RelayUrl[] =>
  store
    .seenRelays(id)
    .map(normalizeRelayUrl)
    .filter((relay) => relay !== undefined);
