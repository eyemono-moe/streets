import { type Mutation, addTagValue, removeTagValue } from "./build/draft";
import type { NostrEvent } from "./event";

const HEX_64 = /^[0-9a-f]{64}$/;

/** プロフィールの上に出す投稿（NIP-51 の Pinned notes）。 */
export const PINNED_NOTES_KIND = 10_001;

/**
 * ピン留めした投稿の id を、後から足したものを先にして返す。NIP-51 のリストは
 * 足した順にタグを後ろへ積むので、最後のものがいちばん新しいピン留めになる。
 */
export const pinnedNoteIds = (event: NostrEvent | undefined): string[] => {
  if (!event) return [];
  const ids: string[] = [];
  for (const tag of event.tags) {
    const id = tag[1];
    if (tag[0] !== "e" || !id || !HEX_64.test(id) || ids.includes(id)) {
      continue;
    }
    ids.push(id);
  }
  return ids.reverse();
};

/** NIP-51 に従い、足したものはタグの末尾に積む。 */
export const pinNote = (id: string): Mutation =>
  addTagValue(PINNED_NOTES_KIND, "e", id);

export const unpinNote = (id: string): Mutation =>
  removeTagValue(PINNED_NOTES_KIND, "e", id);
