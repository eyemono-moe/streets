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
 * Store にある `#e` の候補を、イベント種別ごとの意味で絞り込む。Store は
 * タグ索引までしか知らず、kind 固有の解釈（返信/リポスト/Like）はこの module に閉じる。
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
