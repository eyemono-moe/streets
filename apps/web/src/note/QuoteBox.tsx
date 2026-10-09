import type { ParentComponent } from "solid-js";

/** 別の投稿を添えて出すときの入れ物。 */
const QuoteBox: ParentComponent = (props) => (
  <div class="w-full overflow-hidden rounded-2 border border-primary">
    {props.children}
  </div>
);

export default QuoteBox;
