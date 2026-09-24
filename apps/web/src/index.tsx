/* @refresh reload */
import { Route, Router } from "@solidjs/router";
import { QueryClientProvider } from "@tanstack/solid-query";
import { render } from "solid-js/web";
import App from "./App";
import { createAppQueryClient } from "./query-client";
import { startTelemetry } from "./telemetry";
import { savedColorScheme, setColorScheme } from "./theme";
import "@unocss/reset/tailwind-compat.css";
import "virtual:uno.css";

// 描画より先に始める。読み込みの途中で壊れたときも拾えるように。
void startTelemetry();

// 描画前に付けないと、ダークの環境で一瞬ライトで描かれる。
setColorScheme(savedColorScheme(), false);
const queryClient = createAppQueryClient();

render(
  () => (
    // `/nevent1…` や `/npub1…` は画面を切り替えず、デッキの左端に一時カラムを開く（ADR-0032）。
    // ルートを分けると行き来のたびに App ごと作り直され、読み取り層も張り直される。
    <QueryClientProvider client={queryClient}>
      <Router>
        <Route path="/:entity?" component={App} />
      </Router>
    </QueryClientProvider>
  ),
  // div#root in index.html
  document.getElementById("root")!,
);
