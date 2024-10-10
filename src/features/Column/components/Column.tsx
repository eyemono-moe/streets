import { type Component, Match, Switch } from "solid-js";
import type { ColumnState, PickColumnState } from "../context/deck";
import Followees from "./Column/Followees";
import Followers from "./Column/Followers";
import Followings from "./Column/Followings";
import Notifications from "./Column/Notifications";
import Reactions from "./Column/Reactions";
import User from "./Column/User";
import type { HandleListeners } from "./Columns";

const Column: Component<{
  column: ColumnState;
  handleListeners: HandleListeners;
  isMoving: boolean;
}> = (props) => {
  return (
    <div
      class="relative flex h-full shrink-0 bg-white"
      classList={{
        "w-80": props.column.size === "small",
        "w-100": props.column.size === "medium",
        "w-120": props.column.size === "large",
      }}
    >
      <div
        class="c-zinc-5 absolute m-1 h-6 cursor-move rounded-full hover:bg-zinc-3/50"
        classList={{
          "bg-zinc-3/50": props.isMoving,
        }}
        {...props.handleListeners}
      >
        <div class="i-material-symbols:drag-indicator aspect-square h-full w-auto" />
      </div>
      <Switch>
        <Match when={props.column.type === "timeline"}>
          <Followings state={props.column as PickColumnState<"timeline">} />
        </Match>
        <Match when={props.column.type === "user"}>
          <User state={props.column as PickColumnState<"user">} />
        </Match>
        <Match when={props.column.type === "followees"}>
          <Followees state={props.column as PickColumnState<"followees">} />
        </Match>
        <Match when={props.column.type === "followers"}>
          <Followers state={props.column as PickColumnState<"followers">} />
        </Match>
        <Match when={props.column.type === "reactions"}>
          <Reactions state={props.column as PickColumnState<"reactions">} />
        </Match>
        <Match when={props.column.type === "notifications"}>
          <Notifications
            state={props.column as PickColumnState<"notifications">}
          />
        </Match>
      </Switch>
    </div>
  );
};

export default Column;
