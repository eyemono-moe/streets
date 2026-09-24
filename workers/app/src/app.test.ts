import { afterEach, describe, expect, it, vi } from "vite-plus/test";
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
      {
        headers: { "sec-fetch-site": "cross-site" },
      },
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

describe("GET /api/image", () => {
  const AVATAR = "https://images.example/me.png";
  const imagePath = (source: string, preset = "avatar") =>
    `${ORIGIN}/api/image?preset=${preset}&url=${encodeURIComponent(source)}`;
  const AS_IMAGE = {
    ...SAME_SITE,
    "sec-fetch-dest": "image",
    accept: "image/avif,image/webp,*/*",
  };
  const resizedFetch = (headers: Record<string, string> = {}) =>
    vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response("bytes", {
          headers: {
            "content-type": "image/avif",
            "cf-resized": "internal=ok/- q=0 n=100",
            ...headers,
          },
        }),
    );

  it("決めた大きさに縮め、ブラウザが読める形式で返す", async () => {
    const fetch = resizedFetch();
    const response = await createApp({ fetch }).request(imagePath(AVATAR), {
      headers: AS_IMAGE,
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/avif");
    expect(response.headers.get("cache-control")).toBe(
      "public, max-age=604800",
    );
    expect(response.headers.get("vary")).toBe("accept");
    // 捕まえる変異: 画面から大きさを受け取る（無料枠を大きさの数だけ使われる）
    expect(fetch.mock.calls[0]?.[1]).toMatchObject({
      cf: { image: { width: 160, height: 160, fit: "crop", format: "avif" } },
    });
  });

  it("縮小できなかったら、元の画像へ飛ばす", async () => {
    // 枠切れ（9422）など。画面には今までどおり元の画像が出る。
    const fetch = resizedFetch({ "cf-resized": "err=9422" });
    const response = await createApp({ fetch }).request(imagePath(AVATAR), {
      headers: AS_IMAGE,
    });
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(AVATAR);
  });

  it("変換が有効でない（Cf-Resized が無い）ときも、元の画像へ飛ばす", async () => {
    const fetch = vi.fn(
      async () =>
        new Response("bytes", { headers: { "content-type": "image/png" } }),
    );
    const response = await createApp({ fetch }).request(imagePath(AVATAR), {
      headers: AS_IMAGE,
    });
    expect(response.status).toBe(302);
  });

  it("SVG はこのドメインから返さず、元へ飛ばす", async () => {
    const fetch = resizedFetch({ "content-type": "image/svg+xml" });
    const response = await createApp({ fetch }).request(imagePath(AVATAR), {
      headers: AS_IMAGE,
    });
    expect(response.status).toBe(302);
  });

  it("他のサイトからは縮小せず、元へ飛ばすだけ", async () => {
    const fetch = resizedFetch();
    const response = await createApp({ fetch }).request(imagePath(AVATAR), {
      headers: { ...AS_IMAGE, "sec-fetch-site": "cross-site" },
    });
    expect(response.status).toBe(302);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("画像として読まれたのでなければ飛ばさない", async () => {
    // 捕まえる変異: リンクとして踏ませても飛ぶ（このドメインが任意のサイトへの踏み台になる）
    const fetch = resizedFetch();
    const response = await createApp({ fetch }).request(imagePath(AVATAR), {
      headers: { "sec-fetch-site": "cross-site", "sec-fetch-dest": "document" },
    });
    expect(response.status).toBe(400);
    expect(response.headers.get("location")).toBeNull();
  });

  it("http の元画像・内部のアドレス・知らない型は 400", async () => {
    const fetch = resizedFetch();
    const app = createApp({ fetch });
    for (const path of [
      imagePath("http://images.example/me.png"),
      imagePath("https://127.0.0.1/me.png"),
      imagePath(AVATAR, "huge"),
    ]) {
      expect((await app.request(path, { headers: AS_IMAGE })).status).toBe(400);
    }
    expect(fetch).not.toHaveBeenCalled();
  });

  it("回数の上限を超えたら、縮小せず元へ飛ばす", async () => {
    const fetch = resizedFetch();
    const response = await createApp({ fetch }).request(
      imagePath(AVATAR),
      { headers: AS_IMAGE },
      { IMAGE_LIMITER: { limit: async () => ({ success: false }) } },
    );
    expect(response.status).toBe(302);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("キャッシュに当たれば縮小し直さず、形式ごとに分けて覚える", async () => {
    stubCaches();
    const fetch = resizedFetch();
    const limit = vi.fn(async () => ({ success: true }));
    const app = createApp({ fetch, waitForCache: true });
    const env = { IMAGE_LIMITER: { limit } } as unknown as Env;
    for (let i = 0; i < 2; i += 1) {
      const response = await app.request(
        imagePath(AVATAR),
        { headers: AS_IMAGE },
        env,
      );
      expect(response.status).toBe(200);
      await response.arrayBuffer();
    }
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(limit).toHaveBeenCalledTimes(1);
    // 捕まえる変異: Accept をキャッシュの分け目に入れない（AVIF を読めないブラウザに AVIF を返す）
    await app.request(
      imagePath(AVATAR),
      { headers: { ...AS_IMAGE, accept: "image/png,*/*" } },
      env,
    );
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
