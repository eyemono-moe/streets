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
    ],
  },
] satisfies RouteDefinition[];

export default routes;
