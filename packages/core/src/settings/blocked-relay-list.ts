import { type Mutation, replaceTags } from "../nostr/build/draft";
import type { NostrEvent } from "../nostr/event";
import type { RelayUrl } from "../relay/relay-connection";
import { normalizeRelayUrl } from "../relay/relay-url";

/**
 * 繋がないリレーの一覧（NIP-51 の kind:10006）。Outbox では、フォローした人の
 * リレーや返信相手のリレーへ自分の知らないうちに繋ぐので、そこから外したい
 * リレーをここで持つ。Amethyst・Coracle なども同じ一覧を読む。
 */
export const BLOCKED_RELAY_LIST_KIND = 10_006;

/**
 * kind:10006 の公開の `relay` タグ。非公開（暗号化した content）の項目は
 * まだ読まない。保存しても content はそのまま残る。
 */
export const parseBlockedRelays = (
  event: NostrEvent | undefined,
): RelayUrl[] => {
  if (!event) return [];
  const relays: RelayUrl[] = [];
  for (const tag of event.tags) {
    if (tag[0] !== "relay") continue;
    const url = tag[1] === undefined ? undefined : normalizeRelayUrl(tag[1]);
    if (url && !relays.includes(url)) relays.push(url);
  }
  return relays;
};

/**
 * 一覧を丸ごと差し替える。1 本ずつ足し引きしないのは、他のクライアントが
 * 形をそろえずに書いた URL（末尾の `/` が無いなど）も外せるようにするため。
 */
export const setBlockedRelays =
  (relays: readonly RelayUrl[]): Mutation =>
  (current) =>
    replaceTags(current, BLOCKED_RELAY_LIST_KIND, "relay", () =>
      relays.map((relay) => ["relay", relay]),
    );
