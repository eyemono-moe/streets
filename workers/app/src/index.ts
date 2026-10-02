import { connectRelay } from "@streets/core/relay/websocket-relay-connection";
import { createApp } from "./app";
import { entityPage } from "./entity-page";

const app = createApp();

/**
 * アプリの静的ファイルの前に立つ Worker。`/api/*` と、`/npub1…` などの投稿や人の
 * URL だけを受け、ほかは静的ファイルが直接返す（wrangler.jsonc の `run_worker_first`）。
 */
export default {
  fetch: async (request, env, ctx) => {
    if (new URL(request.url).pathname.startsWith("/api/")) {
      return app.fetch(request, env, ctx);
    }
    return entityPage(request, {
      assets: env.ASSETS,
      connect: (url) => connectRelay(url),
      cache: await caches.open("entity-card"),
      waitUntil: (promise) => ctx.waitUntil(promise),
    });
  },
} satisfies ExportedHandler<Env>;
