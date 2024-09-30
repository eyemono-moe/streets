import { Collapsible } from "@kobalte/core/collapsible";
import { type Component, Match, Switch } from "solid-js";
import { useColumn } from "../context/column";
import type { ColumnState, PickColumnState } from "../context/deck";
import { columnIcon, columnName } from "../libs/columnName";
import Followings from "./Column/Followings";
import User from "./Column/User";

const Column: Component<{
  column: ColumnState;
}> = (props) => {
  const [, actions] = useColumn() ?? [];

  return (
    <div
      class="flex h-full shrink-0 flex-col divide-y"
      classList={{
        "w-80": props.column.size === "small",
        "w-100": props.column.size === "medium",
        "w-120": props.column.size === "large",
      }}
    >
      <Collapsible class="divide-y">
        <div class="c-zinc-8 grid grid-cols-[auto_1fr_auto] items-center gap-1 p-1">
          <div
            class={`${columnIcon(props.column.type)} c-zinc-6 aspect-square h-6 w-auto`}
          />
          {columnName(props.column.type)}
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
      <div class="h-full overflow-y-auto">
        <Switch>
          <Match when={props.column.type === "follow"}>
            <Followings state={props.column as PickColumnState<"follow">} />
          </Match>
          <Match when={props.column.type === "user"}>
            <User state={props.column as PickColumnState<"user">} />
          </Match>
        </Switch>
      </div>
    </div>
  );
};

export default Column;
