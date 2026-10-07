import type { NostrEvent } from "./event";

/** NIP-28 のチャンネルでの発言。 */
const CHANNEL_MESSAGE = 42;

/**
 * 返信の操作を出すか。kind:42 への返信は kind:42（NIP-28）で、kind:1 の返信ダイアログでは
 * 書けない。チャンネルの中のように返信を差し替えられるときだけ出す。
 */
export const canReply = (
  event: NostrEvent,
  options: { custom: boolean },
): boolean => event.kind !== CHANNEL_MESSAGE || options.custom;

/**
 * NIP-51 のブックマークとピン留めは `e` タグで kind:1 のノートを指す。
 * kind:42 は入れない（入っているものを外すことは、kind によらずできる）。
 */
export const canBookmark = (event: NostrEvent): boolean =>
  event.kind !== CHANNEL_MESSAGE;

/** NIP-51 のピン留めは kind:1 の投稿を入れるリスト。ほかの kind は入れない。 */
export const canPin = (event: NostrEvent): boolean => event.kind === 1;
