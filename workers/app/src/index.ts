import { LINK_CARD_PATH, handleLinkCard } from "./link-card-handler";

type Env = {
  ASSETS: Fetcher;
  LINK_CARD_LIMITER: RateLimit;
};

/**
 * アプリの静的ファイルの前に立つ Worker。`/api/*` だけを受け、ほかは静的ファイルに
 * 任せる（wrangler.jsonc の `run_worker_first`）。
 */
export default {
  async fetch(request, env, ctx): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === LINK_CARD_PATH) {
      return handleLinkCard(request, {
        fetch,
        limiter: env.LINK_CARD_LIMITER,
        cache: caches.default,
        waitUntil: (promise) => ctx.waitUntil(promise),
      });
    }
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
