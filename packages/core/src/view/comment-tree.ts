import type { NostrEvent } from "../nostr/event";
import { COMMENT_KIND, replyTarget } from "../nostr/event-refs";

/** これより深い返信は同じ段に並べる。狭いカラムで本文の幅が無くならないように。 */
export const MAX_COMMENT_DEPTH = 3;

export type CommentRow = { event: NostrEvent; depth: number };

const byOldest = (a: NostrEvent, b: NostrEvent) =>
  a.created_at - b.created_at || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/**
 * 記事などへのコメントを、返信の木を上から順に辿った並びにする。
 * 親が手元に無いコメントは一番上の段に置く —— 隠すと、親を取れなかっただけで消える。
 */
export const commentTree = (events: readonly NostrEvent[]): CommentRow[] => {
  const comments = new Map<string, NostrEvent>();
  for (const event of events) {
    if (event.kind === COMMENT_KIND) comments.set(event.id, event);
  }
  const top: NostrEvent[] = [];
  const children = new Map<string, NostrEvent[]>();
  for (const event of comments.values()) {
    const parent = replyTarget(event)?.id;
    if (parent && parent !== event.id && comments.has(parent)) {
      const list = children.get(parent) ?? [];
      list.push(event);
      children.set(parent, list);
    } else {
      top.push(event);
    }
  }

  const rows: CommentRow[] = [];
  const visited = new Set<string>();
  const walk = (event: NostrEvent, depth: number) => {
    if (visited.has(event.id)) return;
    visited.add(event.id);
    rows.push({ event, depth: Math.min(depth, MAX_COMMENT_DEPTH) });
    for (const child of (children.get(event.id) ?? []).sort(byOldest)) {
      walk(child, depth + 1);
    }
  };
  for (const event of top.sort(byOldest)) walk(event, 0);
  // 親を互いに指し合う壊れたコメントは上から辿れないので、最後に一番上の段で出す。
  for (const event of [...comments.values()].sort(byOldest)) walk(event, 0);
  return rows;
};
