import type { RouteDefinition } from "@solidjs/router";
import { lazy } from "solid-js";
import Root from "./layout/Root";

const routes = [
  {
    path: "/",
    component: Root,
    children: [
      {
        path: "/",
        component: lazy(() => import("./routes/index")),
      },
      {
        path: "/post",
        component: lazy(() => import("./routes/post")),
      },
      {
        path: "/settings",
        component: lazy(() => import("./routes/settings")),
      },
      {
        path: "/settings/relay",
        component: lazy(() => import("./routes/settings/relay")),
      },
      {
        path: "/settings/mute",
        component: lazy(() => import("./routes/settings/mute")),
      },
      {
        path: "/settings/file",
        component: lazy(() => import("./routes/settings/file")),
      },
      {
        path: "/settings/profile",
        component: lazy(() => import("./routes/settings/profile")),
      },
      {
        path: "/settings/display",
        component: lazy(() => import("./routes/settings/display")),
      },
      {
        path: "/settings/about",
        component: lazy(() => import("./routes/settings/about")),
      },
      {
        path: "/settings/about/privacy",
        component: lazy(() => import("./routes/settings/about/privacy")),
      },
      {
        path: "/add-column",
        component: lazy(() => import("./routes/addColumn")),
      },
      {
        path: "/add-column/user",
        component: lazy(() => import("./routes/addColumn/user")),
      },
      {
        path: "/add-column/followees",
        component: lazy(() => import("./routes/addColumn/followees")),
      },
      {
        path: "/add-column/followers",
        component: lazy(() => import("./routes/addColumn/followers")),
      },
      {
        path: "/add-column/reactions",
        component: lazy(() => import("./routes/addColumn/reactions")),
      },
    ],
  },
] satisfies RouteDefinition[];

export default routes;
