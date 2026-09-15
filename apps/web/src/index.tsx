/* @refresh reload */
import { render } from "solid-js/web";
import App from "./App";
import { applyColorScheme } from "./theme";
import "@unocss/reset/tailwind-compat.css";
import "virtual:uno.css";

// 描画前に付けないと、ダークの環境で一瞬ライトで描かれる。設定で選べるようになるまでは OS に従う。
applyColorScheme("system");

// biome-ignore lint/style/noNonNullAssertion: div#root in index.html
render(() => <App />, document.getElementById("root")!);
