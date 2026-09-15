/* @refresh reload */
import { render } from "solid-js/web";
import App from "./App";
import "@unocss/reset/tailwind-compat.css";
import "virtual:uno.css";

// biome-ignore lint/style/noNonNullAssertion: div#root in index.html
render(() => <App />, document.getElementById("root")!);
