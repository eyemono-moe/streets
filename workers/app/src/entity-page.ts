import type { Nip19Ref } from "@streets/core/nostr/nip19";
import { type Connect, fetchEntity } from "./entity-fetch";
import {
  type PageMeta,
  entityMeta,
  entityOfPath,
  wantsCard,
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

/** URL が指すものをリレーから引いてカードの中身にする。見つからなければ undefined。 */
export const findEntityMeta = async (
  ref: Nip19Ref,
  connect: Connect,
  url: string,
): Promise<PageMeta | undefined> => {
  try {
    const found = await fetchEntity(ref, connect, QUERY_TIMEOUT_MS);
    return entityMeta(ref, found, url);
  } catch {
    return undefined;
  }
};

/**
 * `/npub1…`・`/nevent1…` などの URL。リンクのカードを作りに来たものには、
 * 指すものをリレーから引いてカードの中身を入れたアプリの HTML を返す。ブラウザで
 * 開いた人には何も足さずにアプリをそのまま返す（リレーを待たせない）。
 */
export const entityPage = async (
  request: Request,
  options: EntityPageOptions,
): Promise<Response> => {
  const url = new URL(request.url);
  const ref = entityOfPath(url.pathname);
  if (!ref || !wantsCard(request.headers)) {
    return options.assets.fetch(request);
  }

  const key = `${url.origin}${url.pathname}?card`;
  const cached = await options.cache?.match(key);
  if (cached) return cached;

  // 静的ファイルの側では、どのパスにもアプリの HTML が返る。
  const app = await options.assets.fetch(new Request(`${url.origin}/`));
  if (!app.ok) return app;
  const html = await app.text();
  const meta = await findEntityMeta(
    ref,
    options.connect,
    `${url.origin}${url.pathname}`,
  );
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
