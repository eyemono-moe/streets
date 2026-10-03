import type { ColumnWidth } from "@streets/core/deck/deck";
import type { JSX } from "solid-js";

/** 段ごとの幅（px）。広げるときは、これが最小の幅と伸びる比率を兼ねる。 */
export const COLUMN_WIDTH_PX: Record<ColumnWidth, number> = {
  s: 320,
  m: 380,
  l: 440,
};

/**
 * 横に並べたカラムの幅。広げるときは、余った幅を基準の幅に比例して配るので、
 * S/M/L の比は保たれる。入りきらないときは基準の幅のまま横にスクロールする。
 */
export const columnWidthStyle = (
  width: ColumnWidth | undefined,
  stretch: boolean,
): JSX.CSSProperties => {
  const px = COLUMN_WIDTH_PX[width ?? "m"];
  return { flex: `${stretch ? px : 0} 0 ${px}px` };
};
