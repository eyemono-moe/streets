import { type Component, Match, Switch } from "solid-js";
import type { ColumnState, PickColumnState } from "../context/deck";
import Followings from "./Column/Followings";
import User from "./Column/User";

const Column: Component<{
  column: ColumnState;
}> = (props) => {
  return (
    <div
      class="flex h-full shrink-0"
      classList={{
        "w-80": props.column.size === "small",
        "w-100": props.column.size === "medium",
        "w-120": props.column.size === "large",
      }}
    >
      <Switch>
        <Match when={props.column.type === "timeline"}>
          <Followings state={props.column as PickColumnState<"timeline">} />
        </Match>
        <Match when={props.column.type === "user"}>
          <User state={props.column as PickColumnState<"user">} />
        </Match>
      </Switch>
    </div>
  );
};

export default Column;
