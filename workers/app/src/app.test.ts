import { afterEach, describe, expect, it, vi } from "vitest";
import { type LinkCardResponse, createApp } from "./app";

const ORIGIN = "https://streets.example";
const SAME_SITE = { "sec-fetch-site": "same-origin" };

const path = (target: string) =>
  `${ORIGIN}/api/link-card?url=${encodeURIComponent(target)}`;

const pageFetch = () =>
  vi.fn(
    async () =>
      new Response('<head><meta property="og:title" content="題名"></head>', {
        headers: { "content-type": "text/html" },
      }),
  );

/** Cloudflare の Cache API の代わり。`caches.open` が返す箱をメモリに持つ。 */
const stubCaches = () => {
  const store = new Map<string, Response>();
  vi.stubGlobal("caches", {
    open: async () => ({
      match: async (key: string) => store.get(key)?.clone(),
      put: async (key: string, value: Response) => {
        store.set(key, value);
      },
    }),
  });
  return store;
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("GET /api/link-card", () => {
  it("カードを返し、取れたものは長くキャッシュさせる", async () => {
    const app = createApp({ fetch: pageFetch() });
    const response = await app.request(path("https://example.com/"), {
      headers: SAME_SITE,
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("public, max-age=86400");
    expect(((await response.json()) as LinkCardResponse).card?.title).toBe(
      "題名",
    );
  });

  it("取れなかったことも短くキャッシュさせる", async () => {
    const app = createApp({
      fetch: vi.fn(async () => new Response("", { status: 404 })),
    });
    const response = await app.request(path("https://example.com/"), {
      headers: SAME_SITE,
    });
    expect(await response.json()).toEqual({ card: null });
    expect(response.headers.get("cache-control")).toBe("public, max-age=3600");
  });

  it("他のサイトのページからの呼び出しは断る", async () => {
    // 捕まえる変異: Sec-Fetch-Site を見ない（他のサイトが取得口として使える）
    const fetch = pageFetch();
    const response = await createApp({ fetch }).request(
      path("https://example.com/"),
      { headers: { "sec-fetch-site": "cross-site" } },
    );
    expect(response.status).toBe(403);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("Sec-Fetch-Site が無ければ Referer で確かめ、どちらも無ければ断る", async () => {
    const app = createApp({ fetch: pageFetch() });
    expect(
      (
        await app.request(path("https://example.com/"), {
          headers: { referer: `${ORIGIN}/` },
        })
      ).status,
    ).toBe(200);
    expect((await app.request(path("https://example.com/"))).status).toBe(403);
  });

  it("開発サーバーでは同じサイトかを確かめない", async () => {
    const app = createApp({ fetch: pageFetch(), skipSiteCheck: true });
    expect((await app.request(path("https://example.com/"))).status).toBe(200);
  });

  it("取りに行ってはいけない URL と、URL の無い呼び出しは 400", async () => {
    const fetch = pageFetch();
    const app = createApp({ fetch });
    expect(
      (await app.request(path("http://127.0.0.1/"), { headers: SAME_SITE }))
        .status,
    ).toBe(400);
    expect(
      (await app.request(`${ORIGIN}/api/link-card`, { headers: SAME_SITE }))
        .status,
    ).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("キャッシュに当たれば外へ取りに行かず、回数も数えない", async () => {
    stubCaches();
    const fetch = pageFetch();
    const limit = vi.fn(async () => ({ success: true }));
    const app = createApp({ fetch, waitForCache: true });
    const env = { LINK_CARD_LIMITER: { limit } } as unknown as Env;
    for (let i = 0; i < 2; i += 1) {
      const response = await app.request(
        path("https://example.com/"),
        { headers: SAME_SITE },
        env,
      );
      expect(response.status).toBe(200);
    }
    // 捕まえる変異: 回数の制限をキャッシュより前に置く（見るたびに数えられる）
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(limit).toHaveBeenCalledTimes(1);
  });

  it("回数の上限を超えたら 429 で、外へ取りに行かない", async () => {
    const fetch = pageFetch();
    const response = await createApp({ fetch }).request(
      path("https://example.com/"),
      { headers: SAME_SITE },
      {
        LINK_CARD_LIMITER: { limit: async () => ({ success: false }) },
      },
    );
    expect(response.status).toBe(429);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("自分のページは外へ取りに行かず、静的ファイルから読む", async () => {
    const fetch = pageFetch();
    const assets = pageFetch();
    const response = await createApp({ fetch }).request(
      path(`${ORIGIN}/`),
      { headers: SAME_SITE },
      { ASSETS: { fetch: assets } } as unknown as Env,
    );
    expect(((await response.json()) as LinkCardResponse).card?.title).toBe(
      "題名",
    );
    // 捕まえる変異: ホスト名を比べずに外への fetch を使う（本番では自分に届かず null になる）
    expect(fetch).not.toHaveBeenCalled();
    expect(assets).toHaveBeenCalledTimes(1);
  });

  it("知らない API は 404", async () => {
    const response = await createApp().request(`${ORIGIN}/api/nothing`, {
      headers: SAME_SITE,
    });
    expect(response.status).toBe(404);
  });
});
