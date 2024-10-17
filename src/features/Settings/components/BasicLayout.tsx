import type { ParentComponent } from "solid-js";
import Header from "./Header";

const BasicLayout: ParentComponent<{
  title?: string;
  backTo?: string;
}> = (props) => {
  return (
    <div class="grid h-full w-full grid-rows-[auto_minmax(0,1fr)] divide-y">
      <Header title={props.title} backTo={props.backTo} />
      <div class="w-full overflow-y-auto p-2">{props.children}</div>
    </div>
  );
};

export default BasicLayout;
