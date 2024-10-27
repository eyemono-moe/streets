/* @refresh reload */
import * as Sentry from "@sentry/solid";
import { render } from "solid-js/web";
import App from "./App";
import "@unocss/reset/tailwind-compat.css";
import "virtual:uno.css";
import "solid-devtools";
import "unfonts.css";

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register(
    import.meta.env.MODE === "production"
      ? "/service-worker.mjs"
      : "/dev-sw.js?dev-sw",
  );
}

Sentry.init({
  dsn: import.meta.env.VITE_SENTRY_DSN,
  environment: import.meta.env.VITE_SENTRY_ENV,
  enabled: import.meta.env.MODE !== "development",
  integrations: [
    Sentry.browserTracingIntegration(),
    // Sentry.replayIntegration(), // TODO: 重いので一旦コメントアウト
  ],
  // Tracing
  tracesSampleRate: 1.0, //  Capture 100% of the transactions
  // Set 'tracePropagationTargets' to control for which URLs distributed tracing should be enabled
  tracePropagationTargets: ["localhost"],
  // Session Replay
  replaysSessionSampleRate: import.meta.env.DEV ? 1.0 : 0.1, // This sets the sample rate at 10%. You may want to change it to 100% while in development and then sample at a lower rate in production.
  replaysOnErrorSampleRate: 1.0, // If you're not already sampling the entire session, change the sample rate to 100% when sampling sessions where errors occur.
});

// biome-ignore lint/style/noNonNullAssertion: div#root in index.html
const root = document.getElementById("root")!;

render(() => <App />, root);
