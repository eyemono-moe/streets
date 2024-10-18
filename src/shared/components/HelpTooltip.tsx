import type { ParentComponent } from "solid-js";
import Tooltip from "./Tooltip";

const HelpTooltip: ParentComponent = (props) => {
  return (
    <Tooltip content={props.children}>
      <div class="i-material-symbols:help-outline-rounded c-secondary aspect-square h-0.75lh w-auto" />
    </Tooltip>
  );
};

export default HelpTooltip;
