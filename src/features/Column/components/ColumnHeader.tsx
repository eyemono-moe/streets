import { Collapsible } from "@kobalte/core/collapsible";
import type { ParentComponent } from "solid-js";
import { useColumn } from "../context/column";
import { columnIcon } from "../libs/columnName";

const ColumnHeader: ParentComponent<{
  title?: string;
  subTitle?: string;
}> = (props) => {
  const [state, actions] = useColumn() ?? [];

  return (
    <Collapsible class="divide-y">
      <div class="c-zinc-8 grid grid-cols-[auto_1fr_auto] items-center gap-1 p-1">
        <div
          class={`${columnIcon(state?.type)} c-zinc-6 aspect-square h-6 w-auto`}
        />
        <div class="truncate text-3">
          <span class="w-full truncate font-500 text-4">{props.title}</span>
          <span class="ml-1 w-full truncate text-zinc-5">{props.subTitle}</span>
        </div>
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
