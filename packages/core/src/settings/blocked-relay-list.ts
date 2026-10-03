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

/**
 * 端末に控える前回の一覧の置き場。kind:10006 はインデクサから取るので、
 * 届くまでの間に繋いでしまわないよう、起動したらまずこれを当てる。
 */
export const blockedRelaysStorageKey = (pubkey: string): string =>
  `streets.v1.blockedRelays.${pubkey}`;

/** 控えが無い・読めないなら、何も止めない。 */
export const loadBlockedRelaysCache = (raw: string | null): RelayUrl[] => {
  if (raw === null) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const relays: RelayUrl[] = [];
  for (const item of parsed) {
    const url = typeof item === "string" ? normalizeRelayUrl(item) : undefined;
    if (url && !relays.includes(url)) relays.push(url);
  }
  return relays;
};

export const saveBlockedRelaysCache = (relays: readonly RelayUrl[]): string =>
  JSON.stringify(relays);
