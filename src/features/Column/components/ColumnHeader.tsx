import { Collapsible } from "@kobalte/core/collapsible";
import type { ParentComponent } from "solid-js";
import { useColumn } from "../context/column";
import { columnIcon } from "../libs/columnIcon";

const ColumnHeader: ParentComponent<{
  title?: string;
  subTitle?: string;
}> = (props) => {
  const [state, actions] = useColumn() ?? [];

  return (
    <Collapsible class="divide-y">
      <div class="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-1 p-1 pl-8">
        <div
          class={`${state?.type ? columnIcon(state?.type) : ""} c-secondary aspect-square h-6 w-auto`}
        />
        <div class="truncate">
          <span class="w-full truncate font-500">{props.title}</span>
          <span class="c-secondary ml-1 w-full truncate text-caption">
            {props.subTitle}
          </span>
        </div>
        <Collapsible.Trigger class="appearance-none bg-transparent">
          <div
            class={
              "i-material-symbols:more-horiz c-secondary aspect-square h-6 w-auto"
            }
          />
        </Collapsible.Trigger>
      </div>
      <Collapsible.Content>
        <button
          class="appearance-none bg-transparent"
          type="button"
          onClick={() => {
            actions?.removeThisColumn();
          }}
        >
          <div class="i-material-symbols:delete-outline-rounded c-red-5 aspect-square h-auto w-6" />
        </button>
      </Collapsible.Content>
    </Collapsible>
  );
};

export default ColumnHeader;
