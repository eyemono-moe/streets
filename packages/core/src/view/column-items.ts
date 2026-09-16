import type { ColumnShow } from "../deck/deck";
import type { NostrEvent } from "../nostr/event";
import { quoteTargets, replyTarget } from "../nostr/event-refs";

/**
 * カラム設定の「表示するもの」で流れを間引く。購読は変えない ——
 * 設定を戻したときに取り直しにならないよう、絞り込みは描くときだけ行う。
 */
export const visibleColumnItems = (
  events: readonly NostrEvent[],
  show: ColumnShow,
): NostrEvent[] =>
  events.filter((event) => {
    if (!show.reposts && (event.kind === 6 || event.kind === 16)) return false;
    if (!show.reactions && event.kind === 7) return false;
    if (event.kind !== 1) return true;
    // 返信と引用は別物。返信でもある引用は返信として扱い、片方だけを切っても消えない。
    if (replyTarget(event)) return show.replies;
    if (quoteTargets(event).length > 0) return show.quotes;
    return true;
  });
