import { type Component, Match, Switch } from "solid-js";
import type { ColumnContent as TColumnContent } from "../libs/deckSchema";
import Followees from "./Column/Followees";
import Followers from "./Column/Followers";
import Followings from "./Column/Followings";
import Notifications from "./Column/Notifications";
import Reactions from "./Column/Reactions";
import User from "./Column/User";

const ColumnContent: Component<{
  content: TColumnContent;
}> = (props) => {
  return (
    <Switch>
      <Match when={props.content.type === "timeline"}>
        <Followings state={props.content as TColumnContent<"timeline">} />
      </Match>
      <Match when={props.content.type === "user"}>
        <User state={props.content as TColumnContent<"user">} />
      </Match>
      <Match when={props.content.type === "followees"}>
        <Followees state={props.content as TColumnContent<"followees">} />
      </Match>
      <Match when={props.content.type === "followers"}>
        <Followers state={props.content as TColumnContent<"followers">} />
      </Match>
      <Match when={props.content.type === "reactions"}>
        <Reactions state={props.content as TColumnContent<"reactions">} />
      </Match>
      <Match when={props.content.type === "notifications"}>
        <Notifications
          state={props.content as TColumnContent<"notifications">}
        />
      </Match>
    </Switch>
  );
};

export default ColumnContent;
