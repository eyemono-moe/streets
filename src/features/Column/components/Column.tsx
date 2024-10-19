import { type Component, Match, Switch } from "solid-js";
import type { ColumnContent, ColumnState } from "../libs/deckSchema";
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
      class="relative flex h-full shrink-0 bg-primary"
      classList={{
        "w-80": props.column.size === "small",
        "w-100": props.column.size === "medium",
        "w-120": props.column.size === "large",
      }}
    >
      <div
        class="c-secondary absolute m-1 h-6 cursor-move rounded-full hover:bg-alpha-hover data-[moving='true']:bg-alpha-active"
        data-moving={props.isMoving}
        {...props.handleListeners}
      >
        <div class="i-material-symbols:drag-indicator aspect-square h-full w-auto" />
      </div>
      <Switch>
        <Match when={props.column.content.type === "timeline"}>
          <Followings
            state={props.column.content as ColumnContent<"timeline">}
          />
        </Match>
        <Match when={props.column.content.type === "user"}>
          <User state={props.column.content as ColumnContent<"user">} />
        </Match>
        <Match when={props.column.content.type === "followees"}>
          <Followees
            state={props.column.content as ColumnContent<"followees">}
          />
        </Match>
        <Match when={props.column.content.type === "followers"}>
          <Followers
            state={props.column.content as ColumnContent<"followers">}
          />
        </Match>
        <Match when={props.column.content.type === "reactions"}>
          <Reactions
            state={props.column.content as ColumnContent<"reactions">}
          />
        </Match>
        <Match when={props.column.content.type === "notifications"}>
          <Notifications
            state={props.column.content as ColumnContent<"notifications">}
          />
        </Match>
      </Switch>
    </div>
  );
};

export default Column;
