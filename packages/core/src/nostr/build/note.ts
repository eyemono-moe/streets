import { parseContent } from "../content";
import type { EventDraft } from "./draft";

/**
 * kind:1 の本文のハッシュタグを `t` タグにする。`parseContent` が
 * NIP-24 に合わせて小文字へ寄せるので、ここでは重複だけを落とす。
 */
export const hashtagTags = (content: string): string[][] =>
  [
    ...new Set(
      parseContent(content, []).flatMap((token) =>
        token.type === "hashtag" ? [token.tag] : [],
      ),
    ),
  ].map((tag) => ["t", tag]);

/**
 * 新しいノート。`t` タグを付けるのは、付けないと本文に `#nostr` と書いても
 * ハッシュタグのカラムに出ないため（カラムは `#t` フィルタで集める）。
 */
export const buildNote = (content: string): EventDraft => ({
  kind: 1,
  tags: hashtagTags(content),
  content,
});
