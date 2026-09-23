import { describe, expect, it, vi } from "vitest";
import {
  LINK_CARD_PATH,
  type LinkCardResponse,
  handleLinkCard,
} from "./link-card-handler";

const ORIGIN = "https://streets.example";
const request = (
  target: string,
  headers: Record<string, string> = { "sec-fetch-site": "same-origin" },
) =>
  new Request(`${ORIGIN}${LINK_CARD_PATH}?url=${encodeURIComponent(target)}`, {
    headers,
  });

const pageFetch = () =>
  vi.fn(
    async () =>
      new Response('<head><meta property="og:title" content="題名"></head>', {
        headers: { "content-type": "text/html" },
      }),
  );

const memoryCache = () => {
  const store = new Map<string, Response>();
  return {
    store,
    cache: {
      match: async (key: Request) => store.get(key.url)?.clone(),
      put: async (key: Request, value: Response) => {
        store.set(key.url, value);
      },
    } as unknown as Cache,
  };
};

describe("handleLinkCard", () => {
  it("カードを返し、取れたものは長くキャッシュさせる", async () => {
    const response = await handleLinkCard(request("https://example.com/"), {
      fetch: pageFetch(),
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("public, max-age=86400");
    expect(((await response.json()) as LinkCardResponse).card?.title).toBe(
      "題名",
    );
  });

  it("取れなかったことも短くキャッシュさせる", async () => {
    const fetch = vi.fn(async () => new Response("", { status: 404 }));
    const response = await handleLinkCard(request("https://example.com/"), {
      fetch,
    });
    expect(await response.json()).toEqual({ card: null });
    expect(response.headers.get("cache-control")).toBe("public, max-age=3600");
  });

  it("他のサイトのページからの呼び出しは断る", async () => {
    // 捕まえる変異: Sec-Fetch-Site を見ない（他のサイトが取得口として使える）
    const fetch = pageFetch();
    const response = await handleLinkCard(
      request("https://example.com/", { "sec-fetch-site": "cross-site" }),
      { fetch },
    );
    expect(response.status).toBe(403);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("Sec-Fetch-Site が無ければ Referer で確かめ、どちらも無ければ断る", async () => {
    expect(
      (
        await handleLinkCard(
          request("https://example.com/", { referer: `${ORIGIN}/` }),
          { fetch: pageFetch() },
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await handleLinkCard(request("https://example.com/", {}), {
          fetch: pageFetch(),
        })
      ).status,
    ).toBe(403);
  });

  it("取りに行ってはいけない URL は 400", async () => {
    const response = await handleLinkCard(request("http://127.0.0.1/"), {
      fetch: pageFetch(),
    });
    expect(response.status).toBe(400);
  });

  it("キャッシュに当たれば外へ取りに行かず、回数も数えない", async () => {
    const { cache } = memoryCache();
    const limiter = { limit: vi.fn(async () => ({ success: true })) };
    const fetch = pageFetch();
    await handleLinkCard(request("https://example.com/"), {
      fetch,
      cache,
      limiter,
    });
    await handleLinkCard(request("https://example.com/"), {
      fetch,
      cache,
      limiter,
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(limiter.limit).toHaveBeenCalledTimes(1);
  });

  it("回数の上限を超えたら 429 で、外へ取りに行かない", async () => {
    const fetch = pageFetch();
    const response = await handleLinkCard(request("https://example.com/"), {
      fetch,
      limiter: { limit: async () => ({ success: false }) },
    });
    expect(response.status).toBe(429);
    expect(fetch).not.toHaveBeenCalled();
  });
});
