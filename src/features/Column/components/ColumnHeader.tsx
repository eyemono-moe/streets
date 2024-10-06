import { Collapsible } from "@kobalte/core/collapsible";
import type { ParentComponent } from "solid-js";
import { useColumn } from "../context/column";
import { columnIcon, columnName } from "../libs/columnName";

const ColumnHeader: ParentComponent<{
  name?: string;
}> = (props) => {
  const [state, actions] = useColumn() ?? [];

  return (
    <Collapsible class="divide-y">
      <div class="c-zinc-8 grid grid-cols-[auto_1fr_auto] items-center gap-1 p-1">
        <div
          class={`${columnIcon(state?.type)} c-zinc-6 aspect-square h-6 w-auto`}
        />
        <span class="w-full truncate">
          {props.name ?? columnName(state.type)}
        </span>
        <Collapsible.Trigger class="appearance-none bg-transparent">
          <div
            class={
              "i-material-symbols:more-horiz c-zinc-6 aspect-square h-6 w-auto"
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
          <div class="i-material-symbols:delete-outline-rounded c-red-7 aspect-square h-auto w-6" />
        </button>
      </Collapsible.Content>
    </Collapsible>
  );
};

export default ColumnHeader;
