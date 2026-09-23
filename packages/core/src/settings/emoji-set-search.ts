import { decodeNip19, decodeNpub } from "../nostr/nip19";
import type { RelayFilter } from "../relay/relay-connection";
import { EMOJI_SET_KIND, type EmojiSetRef } from "./emoji-list";

/**
 * 絵文字セットの探し方。打った言葉の形で決まる ——
 * `naddr` ならその 1 つ、人を指していればその人の作ったもの、
 * それ以外は言葉での検索（NIP-50）。
 *
 * 人や住所での指定を受けるのは、kind:30030 を索引しているリレーが
 * 少ないため。言葉で見つからなくても、貼れば取り込める道を残す。
 */
export type EmojiSetQuery =
  /** 何も打っていないとき。新しく作られたものから並べる。 */
  | { kind: "recent" }
  | { kind: "address"; ref: EmojiSetRef }
  | { kind: "author"; pubkey: string }
  | { kind: "words"; words: string };

/** 一度に受け取る数。多すぎても選べない。 */
export const EMOJI_SET_SEARCH_LIMIT = 30;

export const parseEmojiSetQuery = (
  input: string,
): EmojiSetQuery | undefined => {
  const text = input.trim();
  // 何も打たずに押したら、新しく作られたものを見せる —— 言葉での検索に
  // 答えるリレーは少なく、打っても見つからないことが多い。
  if (text === "") return { kind: "recent" };

  // `nostr:` が付いたまま貼られることがある。
  const bare = text.replace(/^nostr:/i, "");
  const decoded = decodeNip19(bare);
  if (decoded?.kind === "naddr") {
    return decoded.eventKind === EMOJI_SET_KIND
      ? {
          kind: "address",
          ref: { pubkey: decoded.pubkey, identifier: decoded.identifier },
        }
      : undefined;
  }
  if (decoded?.kind === "nprofile") {
    return { kind: "author", pubkey: decoded.pubkey };
  }
  const pubkey = decodeNpub(bare);
  if (pubkey !== undefined) return { kind: "author", pubkey };

  return { kind: "words", words: text };
};

/** 問い合わせの中身。言葉での検索だけは、検索に答えるリレーへ送る。 */
export const emojiSetFilters = (query: EmojiSetQuery): RelayFilter[] => {
  switch (query.kind) {
    case "recent":
      return [{ kinds: [EMOJI_SET_KIND], limit: EMOJI_SET_SEARCH_LIMIT }];
    case "address":
      return [
        {
          kinds: [EMOJI_SET_KIND],
          authors: [query.ref.pubkey],
          "#d": [query.ref.identifier],
        },
      ];
    case "author":
      return [
        {
          kinds: [EMOJI_SET_KIND],
          authors: [query.pubkey],
          limit: EMOJI_SET_SEARCH_LIMIT,
        },
      ];
    case "words":
      return [
        {
          kinds: [EMOJI_SET_KIND],
          search: query.words,
          limit: EMOJI_SET_SEARCH_LIMIT,
        },
      ];
  }
};
