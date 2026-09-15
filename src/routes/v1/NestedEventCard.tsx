import type { ParentComponent } from "solid-js";

/**
 * 入れ子イベントを囲む枠。**枠を描くのは置く側**という規則の実体。
 * `Note.tsx` が `NoteContent.tsx` を import するため中には置けない (循環)。
 */
const NestedEventCard: ParentComponent = (props) => (
  <div class="b-1 overflow-hidden rounded p-1">{props.children}</div>
);

export default NestedEventCard;
