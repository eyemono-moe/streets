import { type Connect, fetchEntity } from "./entity-fetch";
import {
  entityMeta,
  entityOfPath,
  isLinkPreviewBot,
  withMeta,
} from "./entity-meta";

/** 見つかったカード。投稿は書き直せないので、長めに覚える。 */
const HIT_MAX_AGE = 24 * 60 * 60;
/** 見つからなかったときは、届くのを待つ間だけ覚える。 */
const MISS_MAX_AGE = 10 * 60;
/** 1 回の問い合わせを待つ長さ。ボットは数秒で諦めるので、2 回聞いても収まるようにする。 */
const QUERY_TIMEOUT_MS = 2_000;

export type EntityPageOptions = {
  assets: { fetch: typeof fetch };
  connect: Connect;
  /** 作ったページを覚える箱。無ければ毎回作る。 */
  cache?: Pick<Cache, "match" | "put">;
  /** キャッシュへの保存を後回しにする（`ctx.waitUntil`）。無ければ待つ。 */
  waitUntil?: (promise: Promise<unknown>) => void;
};

/**
 * `/npub1…`・`/nevent1…` などの URL。リンクのカードを作りに来たボットには、
 * 指すものをリレーから引いてカードの中身を入れたアプリの HTML を返す。人には
 * 何も足さずにアプリをそのまま返す（リレーを待たせない）。
 */
export const entityPage = async (
  request: Request,
  options: EntityPageOptions,
): Promise<Response> => {
  const url = new URL(request.url);
  const ref = entityOfPath(url.pathname);
  if (!ref || !isLinkPreviewBot(request.headers.get("user-agent"))) {
    return options.assets.fetch(request);
  }

  const key = `${url.origin}${url.pathname}?card`;
  const cached = await options.cache?.match(key);
  if (cached) return cached;

  // 静的ファイルの側では、どのパスにもアプリの HTML が返る。
  const app = await options.assets.fetch(new Request(`${url.origin}/`));
  if (!app.ok) return app;
  const html = await app.text();
  let meta;
  try {
    const found = await fetchEntity(ref, options.connect, QUERY_TIMEOUT_MS);
    meta = entityMeta(ref, found, `${url.origin}${url.pathname}`);
  } catch {
    meta = undefined;
  }
  const response = new Response(meta ? withMeta(html, meta) : html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": `public, max-age=${meta ? HIT_MAX_AGE : MISS_MAX_AGE}`,
    },
  });
  if (options.cache) {
    const saving = options.cache.put(key, response.clone());
    if (options.waitUntil) options.waitUntil(saving);
    else await saving;
  }
  return response;
};
