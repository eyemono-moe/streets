import { CHANNEL_MESSAGE_KIND } from "./channel";
import type { NostrEvent } from "./event";

/**
 * 返信の操作を出すか。kind:42 への返信は kind:42（NIP-28）で、kind:1 の返信ダイアログでは
 * 書けない。チャンネルの中のように返信を差し替えられるときだけ出す。
 */
export const canReply = (
  event: NostrEvent,
  options: { custom: boolean },
): boolean => event.kind !== CHANNEL_MESSAGE_KIND || options.custom;

/**
 * NIP-51 のブックマークは `e` タグで kind:1 のノートを指す。kind:42 は入れない。
 * ほかの kind も `e` タグで入れているのは、まだ直していない差。
 */
export const canBookmark = (event: NostrEvent): boolean =>
  event.kind !== CHANNEL_MESSAGE_KIND;

/** NIP-51 のピン留めは kind:1 の投稿を入れるリスト。ほかの kind は入れない。 */
export const canPin = (event: NostrEvent): boolean => event.kind === 1;
