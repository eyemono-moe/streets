import { type Mutation, replaceTags } from "../nostr/build/draft";
import type { NostrEvent } from "../nostr/event";
import { SEARCH_RELAYS } from "../read/default-relays";
import type { RelayUrl } from "../relay/relay-connection";
import { normalizeRelayUrl } from "../relay/relay-url";

/**
 * 検索を投げるリレーの一覧（NIP-51 の kind:10007）。検索は著者を指定しない
 * ので、どこへ聞きに行くかを Outbox では決められない。誰に聞くかをここで持つ。
 */
export const SEARCH_RELAY_LIST_KIND = 10_007;

/**
 * 自分で決めていない人のための既定。NIP-50 に答えるリレーを並べてある。
 * 運営者も対象の範囲も違うので、設定から変えられる。
 */
export const DEFAULT_SEARCH_RELAYS: readonly RelayUrl[] = SEARCH_RELAYS;

/** kind:10007 の `relay` タグ。並び順のまま使う。 */
export const parseSearchRelays = (
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

export const setSearchRelays =
  (relays: readonly RelayUrl[]): Mutation =>
  (current) =>
    replaceTags(current, SEARCH_RELAY_LIST_KIND, "relay", () =>
      relays.map((relay) => ["relay", relay]),
    );

/**
 * 実際に検索を投げる先。まだ自分で決めていない（kind:10007 が無い）ときは
 * 既定を使う。空の一覧を保存した人には既定を使わない —— 自分で「どこにも
 * 聞かない」と決めた状態を上書きしない。
 */
export const effectiveSearchRelays = (
  event: NostrEvent | undefined,
): readonly RelayUrl[] =>
  event === undefined ? DEFAULT_SEARCH_RELAYS : parseSearchRelays(event);
