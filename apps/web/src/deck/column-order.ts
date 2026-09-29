import type { ColumnDef } from "@streets/core/deck/deck";
import type { DeckUiState } from "@streets/core/deck/deck-ui";
import { keepOrder, moveId } from "@streets/core/deck/sortable";
import { createMemo } from "solid-js";

/**
 * カラムの見せる並び。掴んでいる間は、離したら入る位置へ動かした並びにする。
 *
 * `mounted` は DOM に並べる順で、並べ替えても変えない。見た目の順は `index` を
 * CSS の order に当てて付ける —— 要素を DOM の中で動かすと、その中のスクロール
 * 位置が先頭へ戻り、フォーカスも外れる。そのぶん Tab キーで進む順は、読み込み直す
 * まで元の並びのまま。
 */
export const createColumnOrder = (
  columns: () => readonly ColumnDef[],
  dragging: () => DeckUiState["dragging"],
) => {
  const ids = createMemo(() => {
    const current = columns().map((column) => column.id);
    const drag = dragging();
    return drag ? moveId(current, drag.id, drag.to) : current;
  });
  const index = createMemo(
    () => new Map(ids().map((id, position) => [id, position])),
  );
  const byId = () => new Map(columns().map((column) => [column.id, column]));
  const shown = createMemo(() => {
    const map = byId();
    return ids().flatMap((id) => map.get(id) ?? []);
  });
  const mounted = createMemo<readonly ColumnDef[]>((previous) => {
    const map = byId();
    return keepOrder(
      previous.map((column) => column.id),
      columns().map((column) => column.id),
    ).flatMap((id) => map.get(id) ?? []);
  }, []);
  return {
    /** 見せている並びの id。 */
    ids,
    /** 見せている並びでの位置。CSS の order に当てる。 */
    indexOf: (id: string) => index().get(id) ?? 0,
    /** 見せている並びのカラム。 */
    shown,
    /** DOM に並べる順のカラム。 */
    mounted,
  };
};
