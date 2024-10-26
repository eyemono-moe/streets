import { type Component, Match, Switch } from "solid-js";
import type { ColumnContent as TColumnContent } from "../libs/deckSchema";
import Followees from "./Column/Followees";
import Followers from "./Column/Followers";
import Followings from "./Column/Followings";
import Notifications from "./Column/Notifications";
import Reactions from "./Column/Reactions";
import Search from "./Column/Search";
import Thread from "./Column/Thread";
import User from "./Column/User";

const ColumnContent: Component<{
  content: TColumnContent;
  showHeader?: boolean;
}> = (props) => {
  return (
    <Switch>
      <Match when={props.content.type === "timeline"}>
        <Followings
          showHeader={props.showHeader}
          state={props.content as TColumnContent<"timeline">}
        />
      </Match>
      <Match when={props.content.type === "user"}>
        <User
          showHeader={props.showHeader}
          state={props.content as TColumnContent<"user">}
        />
      </Match>
      <Match when={props.content.type === "followees"}>
        <Followees
          showHeader={props.showHeader}
          state={props.content as TColumnContent<"followees">}
        />
      </Match>
      <Match when={props.content.type === "followers"}>
        <Followers
          showHeader={props.showHeader}
          state={props.content as TColumnContent<"followers">}
        />
      </Match>
      <Match when={props.content.type === "reactions"}>
        <Reactions
          showHeader={props.showHeader}
          state={props.content as TColumnContent<"reactions">}
        />
      </Match>
      <Match when={props.content.type === "notifications"}>
        <Notifications
          showHeader={props.showHeader}
          state={props.content as TColumnContent<"notifications">}
        />
      </Match>
      <Match when={props.content.type === "thread"}>
        <Thread
          showHeader={props.showHeader}
          state={props.content as TColumnContent<"thread">}
        />
      </Match>
      <Match when={props.content.type === "search"}>
        <Search
          showHeader={props.showHeader}
          state={props.content as TColumnContent<"search">}
        />
      </Match>
    </Switch>
  );
};

export default ColumnContent;
