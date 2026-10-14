import type { JSX } from "solid-js";

/**
 * 横に並べたカラムの幅。広げるときは、余った幅を基準の幅に比例して配るので、
 * カラムどうしの幅の比は保たれる。入りきらないときは基準の幅のまま横にスクロールする。
 */
export const columnWidthStyle = (
  px: number,
  stretch: boolean,
): JSX.CSSProperties => ({
  flex: `${stretch ? px : 0} 0 ${px}px`,
  // 幅を flex-basis だけで決めると、flex の項目の最小幅が中身の幅になり、
  // 長い題名でカラムが押し広げられる。
  "min-width": 0,
});
