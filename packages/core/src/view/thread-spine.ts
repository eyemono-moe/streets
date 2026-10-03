import type { NostrEvent } from "../nostr/event";
import { type EventRef, replyTarget } from "../nostr/event-refs";

type IdRef = Extract<EventRef, { form: "id" }>;
import { compareEvents } from "../read/sorted-events";
import { replyParentRef } from "./comment-scope";

export type ThreadSpine = {
  /** 根に近い順。`focus` は含まない。 */
  ancestors: NostrEvent[];
  focus: NostrEvent | undefined;
  /** `created_at` 昇順。`focus` を直接の親とするものだけ。 */
  replies: NostrEvent[];
  /** 祖先の連鎖が根まで到達したか。**`false` を黙らせないこと**——途中が欠けると「根から始まる」ように見え読み違える。 */
  reachedRoot: boolean;
  /** 祖先が手元に無くて止まったとき、その欠けた返信先。取りに行く先。循環で止まったときは無い。 */
  missingParent?: IdRef;
  /**
   * 一番上のコメントが記事などの住所に付いているとき、その住所。id で辿れないので
   * `ancestors` には入らず、別に引いて上に添える。
   */
  scopeRoot?: EventRef;
};

/**
 * 表示する 1 本の背骨を計算する。木ではない —— 兄弟の枝も返信の返信も出さない。
 * `lookup` は `events` に無いものを探す先（手元の store など）。タイムラインで取れた
 * 返信先は、スレッドの購読から届かなくても出す。
 */
export const threadSpine = (
  events: readonly NostrEvent[],
  focusId: string,
  lookup: (id: string) => NostrEvent | undefined = () => undefined,
): ThreadSpine => {
  const byId = new Map(events.map((event) => [event.id, event]));
  const find = (id: string) => byId.get(id) ?? lookup(id);
  const focus = find(focusId);
  if (!focus) {
    return {
      ancestors: [],
      focus: undefined,
      replies: [],
      reachedRoot: false,
    };
  }

  // 上へ登る。**訪問済みを持つ**——壊れた (悪意ある) イベントは自分自身や祖先を親として指せる (NIP-10 の意味論はリレーが検証しない)。
  const ancestors: NostrEvent[] = [];
  const seen = new Set<string>([focus.id]);
  let cursor = focus;
  let reachedRoot = true;
  let missingParent: IdRef | undefined;
  for (;;) {
    const parentRef = replyTarget(cursor);
    if (!parentRef) break;
    if (seen.has(parentRef.id)) {
      reachedRoot = false;
      break;
    }
    const parent = find(parentRef.id);
    if (!parent) {
      reachedRoot = false;
      missingParent = parentRef;
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

  const top = ancestors[0] ?? focus;
  const scope = reachedRoot ? replyParentRef(top) : undefined;
  return {
    ancestors,
    focus,
    replies,
    reachedRoot,
    ...(missingParent ? { missingParent } : {}),
    ...(scope?.form === "address" ? { scopeRoot: scope } : {}),
  };
};
