import type { NostrEvent } from "../nostr/event";
import { replyTarget } from "../nostr/event-refs";
import { compareEvents } from "../read/sorted-events";

export type ThreadSpine = {
  /** 根に近い順。`focus` は含まない。 */
  ancestors: NostrEvent[];
  focus: NostrEvent | undefined;
  /** `created_at` 昇順。`focus` を直接の親とするものだけ。 */
  replies: NostrEvent[];
  /**
   * 祖先の連鎖が根まで到達したか。**`false` を黙らせないこと** ——
   * 途中の祖先が欠けたスレッドは「根から始まっている」ように見え、
   * 誰が誰に返信したのかを読み違える (ADR-0011)。
   */
  reachedRoot: boolean;
};

/**
 * 表示する 1 本の背骨を計算する。木ではない —— 兄弟の枝も返信の返信も
 * 出さない (仕様 1 節)。ネットワークも store も触らない。
 */
export const threadSpine = (
  events: readonly NostrEvent[],
  focusId: string,
): ThreadSpine => {
  const byId = new Map(events.map((event) => [event.id, event]));
  const focus = byId.get(focusId);
  if (!focus) {
    return {
      ancestors: [],
      focus: undefined,
      replies: [],
      reachedRoot: false,
    };
  }

  // 上へ登る。**訪問済みを持つ** —— 壊れた (あるいは悪意ある) イベントは
  // 自分自身や祖先を親として指せる。リレーは NIP-10 のタグ意味論を検証
  // しないので、この形は publish できてしまう。
  const ancestors: NostrEvent[] = [];
  const seen = new Set<string>([focus.id]);
  let cursor = focus;
  let reachedRoot = true;
  for (;;) {
    const parentRef = replyTarget(cursor);
    if (!parentRef) break;
    if (seen.has(parentRef.id)) {
      reachedRoot = false;
      break;
    }
    const parent = byId.get(parentRef.id);
    if (!parent) {
      reachedRoot = false;
      break;
    }
    seen.add(parent.id);
    ancestors.push(parent);
    cursor = parent;
  }
  ancestors.reverse();

  const replies = events
    .filter((event) => replyTarget(event)?.id === focusId)
    .sort((a, b) => a.created_at - b.created_at || compareEvents(a, b));

  return { ancestors, focus, replies, reachedRoot };
};
