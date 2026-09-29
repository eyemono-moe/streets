/** 並びの中の 1 つが占める区間。`start` と `size` は並ぶ向きの長さ。 */
export type SortSlot = { id: string; start: number; size: number };

/** `id` を抜いて `to` 番目へ入れた並び。`to` は入れた後の位置。 */
export const moveId = (
  ids: readonly string[],
  id: string,
  to: number,
): readonly string[] => {
  const from = ids.indexOf(id);
  if (from < 0 || from === to) return ids;
  const next = ids.filter((other) => other !== id);
  next.splice(Math.max(0, Math.min(to, next.length)), 0, id);
  return next;
};

/**
 * 掴んだものを `pointer` の位置で離したら何番目に入るか。`slots` は今見せている並び。
 * 掴んだもの以外で、中央がポインタより手前にあるものの数を数える。
 *
 * 幅が違うもの同士でも行き来しない：隣の中央を越えて入れ替わると、隣は掴んだものの
 * 幅だけ手前へずれるので、その中央はポインタからさらに離れる。
 */
export const dropIndex = (
  slots: readonly SortSlot[],
  dragged: string,
  pointer: number,
): number =>
  slots.filter(
    (slot) => slot.id !== dragged && slot.start + slot.size / 2 < pointer,
  ).length;

/**
 * DOM に並べる順。前の順を保ち、消えたものを抜いて、増えたものを後ろへ足す。
 * 並べ替えで要素を DOM の中で動かすと、その中のスクロール位置が先頭へ戻るので、
 * DOM の順は変えずに見た目の順（CSS の `order`）だけを変える。
 */
export const keepOrder = (
  previous: readonly string[],
  next: readonly string[],
): readonly string[] => {
  const present = new Set(next);
  const kept = previous.filter((id) => present.has(id));
  const known = new Set(kept);
  const added = next.filter((id) => !known.has(id));
  return added.length === 0 && kept.length === previous.length
    ? previous
    : [...kept, ...added];
};
