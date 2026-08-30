import type { ParentComponent } from "solid-js";

/**
 * 入れ子のイベント (返信先・引用先) を囲む枠 (v0 の `RichContents` の引用
 * カードと同じ `b-1 rounded`)。**枠を描くのは置く側**という規則の実体で、
 * `NoteCompact` が padding を持たない (`renderers/Note.tsx` のコメント) の
 * と対になる —— 余白と枠を 1 箇所で決めるので、入れ子が深くなっても
 * 二重にならない。
 *
 * `renderers/Note.tsx` (`NoteFull` の最下部の引用) と `NoteContent.tsx`
 * (本文中に埋め込む引用) の両方から使う。`Note.tsx` が `NoteContent.tsx`
 * を import しているため、`Note.tsx` の中には置けない (循環になる)。
 */
const NestedEventCard: ParentComponent = (props) => (
  <div class="b-1 overflow-hidden rounded p-1">{props.children}</div>
);

export default NestedEventCard;
