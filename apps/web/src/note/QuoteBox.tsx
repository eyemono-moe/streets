import type { ParentComponent } from "solid-js";

/**
 * 別の投稿を添えて出すときの入れ物。背景を一段変えて区切る。
 * 中の投稿の `article` や畳み表示は `bg-primary` で塗るので、そのままだと
 * 入れ物の背景を打ち消す。子孫の側を透過させ、入れ物の背景を見せる。
 */
const QuoteBox: ParentComponent = (props) => (
  <div class="w-full overflow-hidden rounded-2 border border-primary bg-secondary [&_article]:bg-transparent [&_[data-surface]]:bg-transparent">
    {props.children}
  </div>
);

export default QuoteBox;
