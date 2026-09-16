/* @refresh reload */
import { Route, Router } from "@solidjs/router";
import { render } from "solid-js/web";
import App from "./App";
import { applyColorScheme } from "./theme";
import "@unocss/reset/tailwind-compat.css";
import "virtual:uno.css";

// 描画前に付けないと、ダークの環境で一瞬ライトで描かれる。設定で選べるようになるまでは OS に従う。
applyColorScheme("system");

render(
  () => (
    // `/nevent1…` や `/npub1…` は画面を切り替えず、デッキの左端に一時カラムを開く（ADR-0032）。
    // ルートを分けると行き来のたびに App ごと作り直され、読み取り層も張り直される。
    <Router>
      <Route path="/:entity?" component={App} />
    </Router>
  ),
  // biome-ignore lint/style/noNonNullAssertion: div#root in index.html
  document.getElementById("root")!,
);
