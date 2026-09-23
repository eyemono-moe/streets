import { type FetchCardOptions, fetchLinkCard } from "./fetch-card";
import { type LinkCard, allowedTarget } from "./ogp";

export const LINK_CARD_PATH = "/api/link-card";

/** 画面へ返す形。取れなかったときも `card: null` で返し、それもキャッシュする。 */
export type LinkCardResponse = { card: LinkCard | null };

const HIT_MAX_AGE = 24 * 60 * 60;
const MISS_MAX_AGE = 60 * 60;

export type LinkCardDeps = {
  fetch: FetchCardOptions["fetch"];
  /** 取りに行く回数を IP ごとに絞る。無ければ絞らない（開発サーバー）。 */
  limiter?: { limit(options: { key: string }): Promise<{ success: boolean }> };
  cache?: Cache;
  waitUntil?: (promise: Promise<unknown>) => void;
  /** 開発サーバーでは同じサイトかを確かめない。 */
  skipSiteCheck?: boolean;
};

const json = (body: unknown, status: number, maxAge = 0): Response =>
  Response.json(body, {
    status,
    headers: {
      "cache-control": maxAge > 0 ? `public, max-age=${maxAge}` : "no-store",
    },
  });

/**
 * アプリの画面から呼ばれたか。ブラウザは `Sec-Fetch-Site` を付け、ページの
 * スクリプトからは書き換えられないので、他のサイトのページから使われることは
 * これで防げる。付けない古いブラウザには Referer で代える。ブラウザ以外からは
 * 偽れるので、取りに行く回数の制限と合わせて使う。
 */
export const fromSameSite = (request: Request): boolean => {
  const site = request.headers.get("sec-fetch-site");
  if (site !== null) return site === "same-origin";
  const referer = request.headers.get("referer");
  if (!referer) return false;
  try {
    return new URL(referer).host === new URL(request.url).host;
  } catch {
    return false;
  }
};

export const handleLinkCard = async (
  request: Request,
  deps: LinkCardDeps,
): Promise<Response> => {
  if (request.method !== "GET") return json({ error: "method" }, 405);
  if (!deps.skipSiteCheck && !fromSameSite(request)) {
    return json({ error: "forbidden" }, 403);
  }
  const requestUrl = new URL(request.url);
  const target = allowedTarget(requestUrl.searchParams.get("url") ?? "");
  if (!target) return json({ error: "url" }, 400);

  // 同じ URL は誰が聞いても同じ答えなので、聞いた人のヘッダーをキーに混ぜない。
  const cacheKey = new Request(
    `${requestUrl.origin}${LINK_CARD_PATH}?url=${encodeURIComponent(target.toString())}`,
  );
  const cached = await deps.cache?.match(cacheKey);
  if (cached) return cached;

  // 回数を数えるのは、実際に外へ取りに行くときだけ。スクロールで同じリンクを
  // 何度見ても、キャッシュに当たる限り制限に掛からない。
  if (deps.limiter) {
    const key = request.headers.get("cf-connecting-ip") ?? "unknown";
    const { success } = await deps.limiter.limit({ key });
    if (!success) return json({ error: "rate-limited" }, 429);
  }

  let card: LinkCard | undefined;
  try {
    card = await fetchLinkCard(target, { fetch: deps.fetch });
  } catch {
    card = undefined;
  }
  const body: LinkCardResponse = { card: card ?? null };
  const response = json(body, 200, card ? HIT_MAX_AGE : MISS_MAX_AGE);
  if (deps.cache) {
    const put = deps.cache.put(cacheKey, response.clone());
    if (deps.waitUntil) deps.waitUntil(put);
    else await put;
  }
  return response;
};
