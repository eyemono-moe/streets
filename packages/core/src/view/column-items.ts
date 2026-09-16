import type { ColumnShow } from "../deck/deck";
import type { NostrEvent } from "../nostr/event";
import { replyTarget } from "../nostr/event-refs";

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
    // 返信かどうかはタグで決まる。kind:1 のうち親を持つものだけを落とす。
    if (!show.replies && event.kind === 1 && replyTarget(event)) return false;
    return true;
  });
