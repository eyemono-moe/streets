import { addressOfEvent, formatEventAddress } from "../nostr/address";
import type { NostrEvent } from "../nostr/event";
import type { EventRef } from "../nostr/event-refs";
import {
  embeddedRepostEvent,
  repostAddress,
  repostTarget,
} from "../nostr/repost";
import type { EventStore } from "../read/event-store";
import type { RelayUrl } from "../relay/relay-connection";

/**
 * 埋め込みを手元へ入れたときの印。実在のリレーから受け取ったわけではないので、
 * URL の形をしない値にして返信のリレーヒントなどに混ざらないようにする。
 */
const EMBEDDED = "embedded" as RelayUrl;

/**
 * リポスト元を指す参照を返し、`content` に元の投稿が埋め込まれていれば（NIP-18）
 * 署名を確かめて store へ入れておく。入っていれば描く側がリレーへ取りに行かずに済む。
 *
 * 埋め込みはリポストした人が書いた任意の値なので、タグが指すものと違うものは使わない。
 * 違うまま入れると、タグの投稿をリポストしたように見せて別の投稿を描かせられる。
 */
export const resolveRepostTarget = (
  event: NostrEvent,
  store: Pick<EventStore, "put">,
): EventRef | undefined => {
  const address = repostAddress(event);
  const target = repostTarget(event);
  const embedded = embeddedRepostEvent(event);
  const matches = (candidate: NostrEvent) => {
    if (target) return target.id === candidate.id;
    if (address) {
      const own = addressOfEvent(candidate);
      return own !== undefined && formatEventAddress(own) === address.address;
    }
    return true;
  };
  if (embedded && matches(embedded)) {
    const result = store.put(embedded, EMBEDDED);
    if (result !== "rejected" && !target && !address) {
      return { form: "id", id: embedded.id };
    }
  }
  return address ?? target;
};
