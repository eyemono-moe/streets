import { vValidator } from "@hono/valibot-validator";
import { Hono, type MiddlewareHandler } from "hono";
import { cache } from "hono/cache";
import * as v from "valibot";
import { fetchLinkCard } from "./fetch-card";
import { type LinkCard, allowedTarget } from "./ogp";

/** 画面へ返す形。取れなかったときも `card: null` で返し、それもキャッシュする。 */
export type LinkCardResponse = { card: LinkCard | null };

const HIT_MAX_AGE = 24 * 60 * 60;
const MISS_MAX_AGE = 60 * 60;

/**
 * アプリの画面から呼ばれたか。ブラウザは `Sec-Fetch-Site` を付け、ページの
 * スクリプトからは書き換えられないので、他のサイトのページから使われることは
 * これで防げる。付けない古いブラウザには Referer で代える。ブラウザ以外からは
 * 偽れるので、回数の制限と合わせて使う。
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

const sameSiteOnly: MiddlewareHandler = async (c, next) => {
  if (!fromSameSite(c.req.raw)) return c.json({ error: "forbidden" }, 403);
  await next();
};

/**
 * 回数を数える。キャッシュより後ろに置き、実際に外へ取りに行くときだけ数える
 * （スクロールで同じリンクを何度見ても、キャッシュに当たる限り制限に掛からない）。
 */
const rateLimited =
  (
    pick: (env: Env) => RateLimit | undefined,
  ): MiddlewareHandler<{
    Bindings: Env;
  }> =>
  async (c, next) => {
    // テストで env を渡さないときは数えない。
    const limiter = c.env ? pick(c.env) : undefined;
    if (limiter) {
      const key = c.req.header("cf-connecting-ip") ?? "unknown";
      const { success } = await limiter.limit({ key });
      if (!success) return c.json({ error: "rate-limited" }, 429);
    }
    await next();
  };

const linkCardQuery = v.object({
  url: v.pipe(
    v.string(),
    v.check((input) => allowedTarget(input) !== undefined),
  ),
});

export type AppOptions = {
  /** 外へ取りに行く fetch。テストで差し替える。 */
  fetch?: typeof fetch;
  /** 同じサイトかを確かめない。テストで使う。 */
  skipSiteCheck?: boolean;
  /**
   * キャッシュへの保存を待ってから返す。`waitUntil` の無い場所（テスト）で使う。
   * 本番では待たずに返し、保存は `waitUntil` で後回しにする。
   */
  waitForCache?: boolean;
};

/** アプリの静的ファイルの前に立つ API。足すときはここに生やす。 */
export const createApp = (options: AppOptions = {}) => {
  // Workers の fetch は、オブジェクトのメソッドとして呼ぶと this が食い違って落ちる。
  const outbound = options.fetch ?? ((input, init) => fetch(input, init));
  const app = new Hono<{ Bindings: Env }>().basePath("/api");

  if (!options.skipSiteCheck) app.use("*", sameSiteOnly);

  app.get(
    "/link-card",
    vValidator("query", linkCardQuery, (result, c) => {
      if (!result.success) return c.json({ error: "url" }, 400);
    }),
    cache({
      cacheName: "link-card",
      wait: options.waitForCache ?? false,
      // 同じ URL は誰が聞いても同じ答えなので、聞いた人のヘッダーをキーに混ぜない。
      keyGenerator: (c) =>
        `${new URL(c.req.url).origin}/api/link-card?url=${encodeURIComponent(
          allowedTarget(c.req.query("url") ?? "")?.toString() ?? "",
        )}`,
      onCacheNotAvailable: false,
    }),
    rateLimited((env) => env.LINK_CARD_LIMITER),
    async (c) => {
      const target = allowedTarget(c.req.valid("query").url);
      // Worker から自分のホスト名への fetch は本番で通らない。静的ファイルから直接読む。
      const host = new URL(c.req.url).host;
      const assets = c.env?.ASSETS;
      const fetchPage: typeof fetch = (input, init) =>
        assets && new URL(String(input)).host === host
          ? assets.fetch(input, init)
          : outbound(input, init);
      let card: LinkCard | undefined;
      try {
        card = target
          ? await fetchLinkCard(target, { fetch: fetchPage })
          : undefined;
      } catch {
        card = undefined;
      }
      c.header(
        "cache-control",
        `public, max-age=${card ? HIT_MAX_AGE : MISS_MAX_AGE}`,
      );
      return c.json<LinkCardResponse>({ card: card ?? null });
    },
  );

  app.notFound((c) => c.json({ error: "not-found" }, 404));
  return app;
};
