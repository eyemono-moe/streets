import { describe, expect, it } from "vite-plus/test";
import { checkUploadServer, uploadServers } from "./upload-servers";

describe("uploadServers", () => {
  it("Blossom を先に、NIP-96 を後ろに並べ、両方にあるものは Blossom として 1 度だけ試す", () => {
    expect(
      uploadServers(
        ["https://b.example", "https://both.example"],
        ["https://n.example", "https://both.example"],
      ),
    ).toEqual([
      { protocol: "blossom", url: "https://b.example" },
      { protocol: "blossom", url: "https://both.example" },
      { protocol: "nip96", url: "https://n.example" },
    ]);
  });
});

describe("checkUploadServer", () => {
  /** パスごとに返す応答を決めた偽の fetch。HEAD の宛先は乱数なので、メソッドで分ける。 */
  const serverAnswering = (answers: {
    head: () => Response;
    nip96?: () => Response;
  }) =>
    (async (url: string, init?: RequestInit) => {
      if (init?.method === "HEAD") return answers.head();
      if (url.endsWith("/.well-known/nostr/nip96.json") && answers.nip96) {
        return answers.nip96();
      }
      return new Response("", { status: 404 });
    }) as unknown as typeof fetch;

  const check = (fetcher: typeof fetch) =>
    checkUploadServer({ server: "https://a.example", fetcher });

  it("無いハッシュに 404 を返すサーバーは Blossom とみなす", async () => {
    let asked: string | undefined;
    const result = await checkUploadServer({
      server: "https://a.example",
      fetcher: (async (url: string) => {
        asked = url;
        return new Response(null, {
          status: 404,
          headers: { "content-type": "text/plain" },
        });
      }) as unknown as typeof fetch,
    });
    expect(result).toBe("blossom");
    expect(asked).toMatch(/^https:\/\/a\.example\/[0-9a-f]{64}$/);
  });

  it("読むのに認可が要るサーバー（401）も Blossom とみなす", async () => {
    expect(
      await check(
        serverAnswering({ head: () => new Response(null, { status: 401 }) }),
      ),
    ).toBe("blossom");
  });

  it("無いハッシュに 200 で HTML を返すサーバーは Blossom ではない", async () => {
    expect(
      await check(
        serverAnswering({
          head: () =>
            new Response(null, {
              status: 200,
              headers: { "content-type": "text/html; charset=UTF-8" },
            }),
        }),
      ),
    ).toBe("not-blossom");
  });

  it("404 でも HTML のページを返すサイトは Blossom ではない", async () => {
    expect(
      await check(
        serverAnswering({
          head: () =>
            new Response(null, {
              status: 404,
              headers: { "content-type": "text/html" },
            }),
        }),
      ),
    ).toBe("not-blossom");
  });

  it("Blossom ではなく nip96.json を出しているなら NIP-96 のサーバーと分かる", async () => {
    expect(
      await check(
        serverAnswering({
          head: () =>
            new Response(null, {
              status: 200,
              headers: { "content-type": "text/html" },
            }),
          nip96: () =>
            Response.json({ api_url: "https://a.example/api/v2/nip96/upload" }),
        }),
      ),
    ).toBe("nip96");
  });

  it("応答を読めなければ、使えないとは言わない", async () => {
    expect(
      await check((async () => {
        throw new TypeError("Failed to fetch");
      }) as unknown as typeof fetch),
    ).toBe("unknown");
  });

  it("Blossom の窓口を読めなくても、nip96.json を出しているなら NIP-96 のサーバーと分かる", async () => {
    expect(
      await check((async (url: string, init?: RequestInit) => {
        if (init?.method === "HEAD") throw new TypeError("Failed to fetch");
        return url.endsWith("/.well-known/nostr/nip96.json")
          ? Response.json({ api_url: "/n96" })
          : new Response("", { status: 404 });
      }) as unknown as typeof fetch),
    ).toBe("nip96");
  });

  it("サーバーの不調（5xx）は、使えないとは言わない", async () => {
    expect(
      await check(
        serverAnswering({ head: () => new Response(null, { status: 503 }) }),
      ),
    ).toBe("unknown");
  });
});
