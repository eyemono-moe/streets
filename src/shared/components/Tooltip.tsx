import { Tooltip as KTooltip } from "@kobalte/core/tooltip";
import type { JSX, ParentComponent } from "solid-js";
import "../../assets/dialog.css";

const Tooltip: ParentComponent<{
  content: JSX.Element;
}> = (props) => {
  return (
    <KTooltip>
      <KTooltip.Trigger class="appearance-none bg-transparent">
        {props.children}
      </KTooltip.Trigger>
      <KTooltip.Portal>
        <KTooltip.Content class="transform-origin-[--kb-tooltip-content-transform-origin] b-1 max-w-100 animate-[contentHide] animate-duration-100 rounded bg-primary p-2 shadow-lg shadow-ui/25 data-[expanded]:animate-[contentShow] data-[expanded]:animate-duration-100">
          <KTooltip.Arrow />
          {props.content}
        </KTooltip.Content>
      </KTooltip.Portal>
    </KTooltip>
  );
};

export default Tooltip;
