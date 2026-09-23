import { createApp } from "./app";

/**
 * アプリの静的ファイルの前に立つ Worker。`/api/*` だけを受け、ほかは静的ファイルが
 * 直接返す（wrangler.jsonc の `run_worker_first`）。
 */
export default createApp();
