import { USER_STATUS_KIND } from "../user-status";
import type { EventDraft } from "./draft";
import { type EmojiLookup, shortcodesIn } from "./references";

export type UserStatusInput = {
  /** 空にするとステータスを消す（NIP-38）。 */
  content: string;
  /** `r` に入れる URL。 */
  link?: string;
  /** 消える時刻（秒）。 */
  expiresAt?: number;
  /** 本文の `:shortcode:` に `emoji` タグ（NIP-30）を付けるために引く先。 */
  emoji?: EmojiLookup;
};

/**
 * 自分のいまの状態（NIP-38 の `d=general`）。聴いている曲（`music`）は再生する
 * アプリが書くもので、ここでは作らない。
 */
export const buildUserStatus = (input: UserStatusInput): EventDraft => {
  const content = input.content.trim();
  const link = input.link?.trim();
  // `withReferences` は使わない。本文で指した人に `p` を付けると、NIP-38 では
  // 「このステータスのリンク先」と読まれてしまう。
  const emojiTags = shortcodesIn([content]).flatMap((shortcode) => {
    const url = input.emoji?.(shortcode);
    return url === undefined ? [] : [["emoji", shortcode, url]];
  });
  return {
    kind: USER_STATUS_KIND,
    content,
    tags: [
      ["d", "general"],
      // 消すときは、期限やリンクを残さない。
      ...(content && link ? [["r", link]] : []),
      ...(content && input.expiresAt !== undefined
        ? [["expiration", String(input.expiresAt)]]
        : []),
      ...emojiTags,
    ],
  };
};
