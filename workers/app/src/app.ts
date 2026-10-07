import { vValidator } from "@hono/valibot-validator";
import type { EmojiSpec } from "@streets/core/emoji-maker/spec";
import { isValidSpec } from "@streets/core/emoji-maker/url";
import { type Context, Hono, type MiddlewareHandler } from "hono";
import { cache } from "hono/cache";
import * as v from "valibot";
import { type EmojiResult, createEmoji } from "./emoji";
import { fetchLinkCard } from "./fetch-card";
import {
  IMAGE_PRESETS,
  type ImagePreset,
  imageSource,
  isImagePreset,
  resized,
} from "./image";
import { type LinkCard, allowedTarget } from "./ogp";

/** 画面へ返す形。取れなかったときも `card: null` で返し、それもキャッシュする。 */
export type LinkCardResponse = { card: LinkCard | null };

const HIT_MAX_AGE = 24 * 60 * 60;
const MISS_MAX_AGE = 60 * 60;
/** 縮小した画像。元の URL が同じなら中身もまず変わらない。 */
const IMAGE_MAX_AGE = 7 * 24 * 60 * 60;
/** 縮小できず元へ戻した答え。枠切れなどは時間で直るので、短めに覚えさせる。 */
const FALLBACK_MAX_AGE = 60 * 60;

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
    onLimited: (c: Context<{ Bindings: Env }>) => Response = (c) =>
      c.json({ error: "rate-limited" }, 429),
  ): MiddlewareHandler<{
    Bindings: Env;
  }> =>
  async (c, next) => {
    // テストで env を渡さないときは数えない。
    const limiter = c.env ? pick(c.env) : undefined;
    if (limiter) {
      const key = c.req.header("cf-connecting-ip") ?? "unknown";
      const { success } = await limiter.limit({ key });
      if (!success) return onLimited(c);
    }
    await next();
  };

type ImageRequest = { source: URL; preset: ImagePreset };

const imageRequestOf = (c: Context): ImageRequest | undefined => {
  const source = imageSource(c.req.query("url") ?? "");
  const preset = c.req.query("preset") ?? "";
  return source && isImagePreset(preset) ? { source, preset } : undefined;
};

/**
 * 縮小を頼んでよい呼び出しか。Streets の画面からのほかに、利用者がアドレス欄に貼る・
 * 「新しいタブで開く」など自分で開いたとき（`none`）も縮小して返す。`none` は
 * ほかのサイトのページからは作れない。
 */
const mayResize = (request: Request): boolean =>
  request.headers.get("sec-fetch-site") === "none" || fromSameSite(request);

/**
 * 縮小できないときは元の画像へ飛ばし、画面には今までどおり元の画像が出るようにする。
 * 飛ばすのは画像として読まれたときだけ —— ページとして開かせて飛ばすと、このドメインから
 * 任意のサイトへ飛ばす踏み台になる（貼られた URL を開いたときも `none` になるので、
 * 自分で開いたときも飛ばさない）。その代わり、元の URL を文字で示す。
 */
const fallbackTo = (c: Context, source: URL): Response => {
  if (c.req.header("sec-fetch-dest") !== "image") {
    c.header("cache-control", "no-store");
    c.header("x-content-type-options", "nosniff");
    return c.text(
      `この画像は縮小できませんでした。\n元の画像: ${source.toString()}\n`,
      400,
    );
  }
  c.header("cache-control", `private, max-age=${FALLBACK_MAX_AGE}`);
  return c.redirect(source.toString(), 302);
};

const hexColor = v.pipe(v.string(), v.regex(/^#[0-9a-fA-F]{6}$/));

/** 作る絵文字の指定。形を確かめたあと、中身（字数・太さなど）は `isValidSpec` で見る。 */
const emojiBody = v.pipe(
  v.object({
    lines: v.pipe(v.array(v.pipe(v.string(), v.maxLength(64))), v.maxLength(3)),
    shape: v.picklist(["square", "wide"]),
    fit: v.picklist(["stretch", "keep"]),
    align: v.picklist(["left", "center", "right"]),
    color: hexColor,
    outline: v.nullable(hexColor),
    outlineWidth: v.number(),
    font: v.picklist(["gothic", "rounded", "serif"]),
  }),
  v.check((spec) => isValidSpec(spec as EmojiSpec)),
);

/** 画面へ返す形。 */
export type EmojiResponse =
  | { url: string }
  | { error: "spec" | "denied" | "rate-limited" }
  | { error: "missing-chars"; chars: string[] };

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

  if (!options.skipSiteCheck) app.use("/link-card", sameSiteOnly);

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
        assets &&
        new URL(input instanceof Request ? input.url : input).host === host
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

  app.get(
    "/image",
    async (c, next) => {
      const request = imageRequestOf(c);
      if (!request) return c.json({ error: "url" }, 400);
      // 他のサイトから使われても、縮小はせず元へ飛ばすだけにする（得をさせない）。
      if (!options.skipSiteCheck && !mayResize(c.req.raw)) {
        return fallbackTo(c, request.source);
      }
      await next();
    },
    cache({
      cacheName: "image",
      wait: options.waitForCache ?? false,
      keyGenerator: (c) => {
        const request = imageRequestOf(c);
        return `${new URL(c.req.url).origin}/api/image?preset=${request?.preset}&url=${encodeURIComponent(
          request?.source.toString() ?? "",
        )}`;
      },
      onCacheNotAvailable: false,
    }),
    rateLimited(
      (env) => env.IMAGE_LIMITER,
      (c) => {
        const request = imageRequestOf(c);
        return request
          ? fallbackTo(c, request.source)
          : c.json({ error: "url" }, 400);
      },
    ),
    async (c) => {
      const request = imageRequestOf(c);
      if (!request) return c.json({ error: "url" }, 400);
      let response: Response;
      try {
        response = await outbound(request.source.toString(), {
          cf: {
            image: IMAGE_PRESETS[request.preset],
          },
          signal: AbortSignal.timeout(10_000),
        });
      } catch {
        return fallbackTo(c, request.source);
      }
      if (!resized(response)) {
        void response.body?.cancel().catch(() => {});
        return fallbackTo(c, request.source);
      }
      return new Response(response.body, {
        headers: {
          "content-type": response.headers.get("content-type") ?? "",
          "cache-control": `public, max-age=${IMAGE_MAX_AGE}`,
          // このドメインから返すので、画像以外として解釈させない。
          "x-content-type-options": "nosniff",
          "content-security-policy": "default-src 'none'",
        },
      });
    },
  );

  if (!options.skipSiteCheck) app.use("/emoji", sameSiteOnly);

  app.post(
    "/emoji",
    vValidator("json", emojiBody, (result, c) => {
      if (!result.success) return c.json<EmojiResponse>({ error: "spec" }, 400);
    }),
    async (c) => {
      const env = c.env;
      const result: EmojiResult = await createEmoji(
        c.req.valid("json") as EmojiSpec,
        {
          bucket: env.EMOJI_BUCKET,
          readShard: async (font, name) => {
            const res = await env.ASSETS.fetch(
              new URL(`/emoji-glyphs/v1/${font}/${name}.bin`, c.req.url),
            );
            // 無いファイルは、一枚の画面の index.html が 200 で返る。
            const type = res.headers.get("content-type") ?? "";
            if (!res.ok || type.includes("html")) {
              void res.body?.cancel().catch(() => {});
              return undefined;
            }
            return res.arrayBuffer();
          },
          allowRender: async () => {
            const key = c.req.header("cf-connecting-ip") ?? "unknown";
            return (await env.EMOJI_LIMITER.limit({ key })).success;
          },
        },
      );
      c.header("cache-control", "no-store");
      switch (result.type) {
        case "ok":
          return c.json<EmojiResponse>({ url: result.url });
        case "denied":
          return c.json<EmojiResponse>({ error: "denied" }, 403);
        case "rate-limited":
          return c.json<EmojiResponse>({ error: "rate-limited" }, 429);
        case "missing-chars":
          return c.json<EmojiResponse>(
            { error: "missing-chars", chars: result.chars },
            400,
          );
      }
    },
  );

  app.notFound((c) => c.json({ error: "not-found" }, 404));
  return app;
};
