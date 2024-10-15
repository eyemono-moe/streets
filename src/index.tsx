/* @refresh reload */
import { init } from "nostr-login";
import { render } from "solid-js/web";
import App from "./App";
import "@unocss/reset/tailwind-compat.css";
import "virtual:uno.css";
import "solid-devtools";
import "unfonts.css";

const setup = async () => {
  await init({});

  // biome-ignore lint/style/noNonNullAssertion: div#root in index.html
  const root = document.getElementById("root")!;

  render(() => <App />, root);
};

setup();
