import { replyTarget, repostTarget } from "../nostr/event-refs";
import { type ReactionContent, parseReaction } from "../nostr/reaction";
import type { EventStore } from "../read/event-store";
import { reactionKey } from "./reaction-groups";

export type EventEngagements = {
  replies: number;
  reposts: number;
  /** 中身を問わない kind:7 の総数。`-` も含める。 */
  reactions: number;
  viewerReposted: boolean;
  /** 自分が `viewerReaction` と同じ中身のリアクションを送っているか。 */
  viewerReacted: boolean;
};

/**
 * Store にある `#e` の候補を、イベント種別ごとの意味で絞り込む。Store は
 * タグ索引までしか知らず、kind 固有の解釈（返信/リポスト/リアクション）はこの module に閉じる。
 *
 * `viewerReaction` はいいねボタンで送る中身。同じ投稿に別の絵文字を付けていても、
 * ボタンで送るものとは別なので「済み」にしない。
 */
export const eventEngagements = (
  store: Pick<EventStore, "eventsByTag">,
  targetId: string,
  viewerPubkey?: string,
  viewerReaction: ReactionContent = { type: "like" },
): EventEngagements => {
  let replies = 0;
  let reposts = 0;
  let reactions = 0;
  let viewerReposted = false;
  let viewerReacted = false;
  const key = reactionKey(viewerReaction);

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
    if (reaction?.targetId !== targetId) continue;
    reactions += 1;
    if (event.pubkey === viewerPubkey && reactionKey(reaction.content) === key)
      viewerReacted = true;
  }

  return { replies, reposts, reactions, viewerReposted, viewerReacted };
};
