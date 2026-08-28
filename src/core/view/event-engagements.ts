import { replyTarget, repostTarget } from "../nostr/event-refs";
import { parseReaction } from "../nostr/reaction";
import type { EventStore } from "../read/event-store";

export type EventEngagements = {
  replies: number;
  reposts: number;
  likes: number;
  viewerReposted: boolean;
  viewerLiked: boolean;
};

/**
 * Store にある `#e` の候補を、イベント種別ごとの意味で絞り込む。
 * Store はタグ索引までしか知らず、直接返信・リポスト・Like の解釈は
 * kind 固有の parser を呼ぶこの module に閉じる (ADR-0004)。
 */
export const eventEngagements = (
  store: Pick<EventStore, "eventsByTag">,
  targetId: string,
  viewerPubkey?: string,
): EventEngagements => {
  let replies = 0;
  let reposts = 0;
  let likes = 0;
  let viewerReposted = false;
  let viewerLiked = false;

  for (const event of store.eventsByTag("e", targetId)) {
    if (event.kind === 1 && replyTarget(event)?.id === targetId) {
      replies += 1;
      continue;
    }

    if (event.kind === 6 && repostTarget(event)?.id === targetId) {
      reposts += 1;
      if (event.pubkey === viewerPubkey) viewerReposted = true;
      continue;
    }

    const reaction = parseReaction(event);
    if (reaction?.targetId === targetId && reaction.content.type === "like") {
      likes += 1;
      if (event.pubkey === viewerPubkey) viewerLiked = true;
    }
  }

  return { replies, reposts, likes, viewerReposted, viewerLiked };
};
