/**
 * 狭い画面でカラムを 1 枚ずつ送る帯の、見た目の並び。
 *
 * 端で払っても反対の端へ回り込めるよう、`anchor` を真ん中に置くように並びを回す。
 * 払って止まるたびに選んだカラムを `anchor` にし直せば、いつも左右に隣のカラムがある。
 * 2 枚以下では左右の隣が同じカラムになり回せないので、元の並びのまま返す。
 */
export const loopStrip = (
  ids: readonly string[],
  anchor: string | undefined,
): readonly string[] => {
  const at = anchor === undefined ? -1 : ids.indexOf(anchor);
  if (ids.length < 3 || at < 0) return ids;
  const start = (at - Math.floor(ids.length / 2) + ids.length) % ids.length;
  return [...ids.slice(start), ...ids.slice(0, start)];
};
