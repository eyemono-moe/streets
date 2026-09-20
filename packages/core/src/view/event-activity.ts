import type { NostrEvent } from "../nostr/event";
import { quoteTargets, repostTarget } from "../nostr/event-refs";
import { type ReactionContent, parseReaction } from "../nostr/reaction";

export type ActivityReaction = {
  pubkey: string;
  contents: { content: ReactionContent; count: number }[];
};

export type EventActivity = {
  reposts: string[];
  quotes: NostrEvent[];
  reactions: ActivityReaction[];
};

const reactionKey = (content: ReactionContent): string =>
  content.type === "like"
    ? "+"
    : content.type === "emoji"
      ? `:${content.name}:${content.url}`
      : content.content;

/** 同じ利用者による同種の操作をまとめ、壊れた参照は無視する。 */
export const eventActivity = (
  events: readonly NostrEvent[],
  targetId: string,
): EventActivity => {
  const reposts = new Set<string>();
  const quotes = new Map<string, NostrEvent>();
  const reactions = new Map<
    string,
    Map<string, { content: ReactionContent; count: number }>
  >();

  for (const event of events) {
    if (
      (event.kind === 6 || event.kind === 16) &&
      repostTarget(event)?.id === targetId
    ) {
      reposts.add(event.pubkey);
      continue;
    }
    if (
      event.kind === 1 &&
      quoteTargets(event).some(
        (target) => target.form === "id" && target.id === targetId,
      )
    ) {
      quotes.set(event.id, event);
      continue;
    }
    const reaction = parseReaction(event);
    if (reaction?.targetId !== targetId) continue;
    const contents = reactions.get(event.pubkey) ?? new Map();
    const key = reactionKey(reaction.content);
    const current = contents.get(key);
    contents.set(key, {
      content: reaction.content,
      count: (current?.count ?? 0) + 1,
    });
    reactions.set(event.pubkey, contents);
  }

  return {
    reposts: [...reposts],
    quotes: [...quotes.values()],
    reactions: [...reactions].map(([pubkey, contents]) => ({
      pubkey,
      contents: [...contents.values()],
    })),
  };
};
