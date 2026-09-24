import type { NostrEvent } from "../nostr/event";
import { embeddedRepostEvent, repostTarget } from "../nostr/event-refs";
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
 * 埋め込みはリポストした人が書いた任意の値なので、`e` タグと id が違うものは使わない。
 * 違うまま入れると、`e` タグの投稿をリポストしたように見せて別の投稿を描かせられる。
 */
export const resolveRepostTarget = (
  event: NostrEvent,
  store: Pick<EventStore, "put">,
): ReturnType<typeof repostTarget> => {
  const target = repostTarget(event);
  const embedded = embeddedRepostEvent(event);
  if (embedded && (target === undefined || target.id === embedded.id)) {
    const result = store.put(embedded, EMBEDDED);
    if (result !== "rejected" && target === undefined) {
      return { form: "id", id: embedded.id };
    }
  }
  return target;
};
