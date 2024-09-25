import { lazy } from "solid-js";

const routes = [
  {
    path: "/",
    component: lazy(() => import("./routes/index")),
  },
];

export default routes;
