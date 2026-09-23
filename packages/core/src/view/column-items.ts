import type { ColumnFacet } from "../deck/column-facets";
import type { ColumnShow } from "../deck/deck";
import type { NostrEvent } from "../nostr/event";
import { quoteTargets, replyTarget } from "../nostr/event-refs";

/**
 * カラム設定の「表示するもの」で流れを間引く。購読は変えない ——
 * 設定を戻したときに取り直しにならないよう、絞り込みは描くときだけ行う。
 *
 * `facets` はそのカラムで意味を持つ項目（`columnFacets`）。含まれない項目では
 * 間引かない —— 例えば「メンション」はホームでは意味を持たず、適用すると
 * 普通の投稿まで消える。
 */
export const visibleColumnItems = (
  events: readonly NostrEvent[],
  show: ColumnShow,
  facets: readonly ColumnFacet[],
): NostrEvent[] => {
  const off = (facet: ColumnFacet) => facets.includes(facet) && !show[facet];
  return events.filter((event) => {
    if (off("reposts") && (event.kind === 6 || event.kind === 16)) return false;
    if (off("reactions") && event.kind === 7) return false;
    if (off("zaps") && event.kind === 9735) return false;
    if (event.kind !== 1) return true;
    // 返信と引用は別物。返信でもある引用は返信として扱い、片方だけを切っても消えない。
    if (replyTarget(event)) return !off("replies");
    if (quoteTargets(event).length > 0) return !off("quotes");
    return !off("mentions");
  });
};
