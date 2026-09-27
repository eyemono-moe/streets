import { decodeNip19 } from "../nostr/nip19";
import type { RelayFilter } from "../relay/relay-connection";

/** 一度に受け取る人数。補完の一覧に並べきれる数にとどめる。 */
export const USER_SEARCH_LIMIT = 20;

/**
 * 名前などで人を探す、検索リレーへの問い合わせ（プロフィールへの NIP-50）。
 * ID（npub1… / nprofile1…）を貼ったときや、1 文字だけのときは問い合わせない ——
 * ID はそのまま使え、1 文字では候補が多すぎて絞れない。
 */
export const userSearchFilter = (input: string): RelayFilter | undefined => {
  const text = input.trim();
  if (text.length < 2) return undefined;
  if (decodeNip19(text.replace(/^nostr:/i, "")) !== undefined) return undefined;
  return { kinds: [0], search: text, limit: USER_SEARCH_LIMIT };
};
