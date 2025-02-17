import { type Component, lazy } from "solid-js";
import { Dynamic } from "solid-js/web";
import type {
  ColumnState,
  ColumnContent as TColumnContent,
} from "../libs/deckSchema";

const columnComponents = {
  followees: lazy(() => import("./Column/Followees")),
  timeline: lazy(() => import("./Column/Followings")),
  followers: lazy(() => import("./Column/Followers")),
  notifications: lazy(() => import("./Column/Notifications")),
  reactions: lazy(() => import("./Column/Reactions")),
  reposts: lazy(() => import("./Column/Reposts")),
  search: lazy(() => import("./Column/Search")),
  thread: lazy(() => import("./Column/Thread")),
  user: lazy(() => import("./Column/User")),
} satisfies {
  [K in TColumnContent["type"]]: Component<{
    state: TColumnContent<K>;
    isTempColumn?: boolean;
  }>;
};

const ColumnContent = <T extends ColumnState["content"]["type"]>(props: {
  content: TColumnContent<T>;
  isTempColumn?: boolean;
}) => {
  return (
    // @ts-ignore: @2322 cannot infer the type of this component
    <Dynamic
      component={columnComponents[props.content.type]}
      isTempColumn={props.isTempColumn}
      state={props.content}
    />
  );
};

export default ColumnContent;
