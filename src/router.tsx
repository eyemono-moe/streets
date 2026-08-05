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
      {
        path: "/debug/v1-core",
        component: lazy(() => import("./routes/debug/v1-core")),
      },
      {
        path: "/debug/v1-section",
        component: lazy(() => import("./routes/debug/v1-section")),
      },
    ],
  },
  // `/v1-preview` は `Root` の子ではなく、`"/"` と並ぶトップレベルの経路に
  // する。`Root` は旧実装の `<Columns />` を `{props.children}` の隣に常時
  // 描画するため、`Root` の子のままだと 3 カラムが旧デッキの "Home" /
  // "Notifications" カラムに押し潰されて画面幅が足りない (Task 2 のスクリ
  // ーンショットで確認済み)。トップレベルにすれば `Root` を完全に経由せず、
  // ビューポート全幅を使える。`App.tsx` のプロバイダ (nostr-login 含む) は
  // `<Router>` の外側にあるので、トップレベル経路でも変わらず効く。
  {
    path: "/v1-preview",
    component: lazy(() => import("./routes/v1-preview")),
  },
] satisfies RouteDefinition[];

export default routes;
