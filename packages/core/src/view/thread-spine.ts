import type { NostrEvent } from "../nostr/event";
import { replyTarget } from "../nostr/event-refs";
import { compareEvents } from "../read/sorted-events";

export type ThreadSpine = {
  /** 根に近い順。`focus` は含まない。 */
  ancestors: NostrEvent[];
  focus: NostrEvent | undefined;
  /** `created_at` 昇順。`focus` を直接の親とするものだけ。 */
  replies: NostrEvent[];
  /** 祖先の連鎖が根まで到達したか。**`false` を黙らせないこと**——途中が欠けると「根から始まる」ように見え読み違える。 */
  reachedRoot: boolean;
  /** 件数の上限で古い返信を落としたかもしれない。`replies` だけを見ると、欠けていても揃っているように見える。 */
  repliesMayBeMissing: boolean;
};

export type ThreadSpineOptions = {
  /**
   * 集めた一覧が件数の上限に達しているとき、残っている中で最も古い `created_at`。
   * これ以前（同じ秒を含む）のイベントは追い出されているかもしれない。上限に達していなければ省く。
   */
  oldestKept?: number;
};

/** 表示する 1 本の背骨を計算する。木ではない —— 兄弟の枝も返信の返信も出さない。ネットワーク/store は触らない。 */
export const threadSpine = (
  events: readonly NostrEvent[],
  focusId: string,
  options: ThreadSpineOptions = {},
): ThreadSpine => {
  const byId = new Map(events.map((event) => [event.id, event]));
  const focus = byId.get(focusId);
  if (!focus) {
    return {
      ancestors: [],
      focus: undefined,
      replies: [],
      reachedRoot: false,
      repliesMayBeMissing: false,
    };
  }

  // 上へ登る。**訪問済みを持つ**——壊れた (悪意ある) イベントは自分自身や祖先を親として指せる (NIP-10 の意味論はリレーが検証しない)。
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

  // 返信は焦点より新しい（か同じ秒）。焦点が残っている最古より新しければ、返信はどれも落ちていない。
  const repliesMayBeMissing =
    options.oldestKept !== undefined && focus.created_at <= options.oldestKept;

  return { ancestors, focus, replies, reachedRoot, repliesMayBeMissing };
};
