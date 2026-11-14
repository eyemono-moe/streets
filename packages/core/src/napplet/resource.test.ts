import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { describe, expect, it } from "vite-plus/test";
import {
  NAPPLET_RESOURCE_MAX_BYTES,
  fetchNappletResource,
  parseBlossomUri,
  sniffMime,
} from "./resource";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const HASH = bytesToHex(sha256(PNG));
const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>';

describe("fetchNappletResource", () => {
  it("https は直接取り、種類は返事の Content-Type ではなく中身から決める", async () => {
    const result = await fetchNappletResource("https://a.example/x", {
      fetch: async () =>
        new Response(PNG, { headers: { "content-type": "text/html" } }),
    });
    expect(result).toMatchObject({ ok: true, mime: "image/png" });
  });

  it("直接取れなければ（CORS で断られたなど）、中継の URL で取り直す", async () => {
    const asked: string[] = [];
    const result = await fetchNappletResource("https://no-cors.example/x.png", {
      fetch: async (url) => {
        asked.push(url);
        if (url.startsWith("https://")) throw new TypeError("Failed to fetch");
        return new Response(PNG);
      },
      proxy: (url) =>
        `/api/image?preset=napplet&url=${encodeURIComponent(url)}`,
    });
    expect(result.ok).toBe(true);
    expect(asked[1]).toBe(
      "/api/image?preset=napplet&url=https%3A%2F%2Fno-cors.example%2Fx.png",
    );
  });

  it("大きすぎる中身は渡さない", async () => {
    const result = await fetchNappletResource("https://a.example/big", {
      fetch: async () =>
        new Response(PNG, {
          headers: { "content-length": String(NAPPLET_RESOURCE_MAX_BYTES + 1) },
        }),
    });
    expect(result).toEqual({ ok: false, error: "too-large" });
  });

  // BUD-10: `blossom:<sha256>.<ext>?xs=<server>`
  it("blossom: はハッシュで取り、照合が通ったものだけを返す", async () => {
    const result = await fetchNappletResource(
      `blossom:${HASH}.png?xs=cdn.example`,
      {
        fetch: async (url) =>
          url === `https://cdn.example/${HASH}`
            ? new Response(PNG)
            : new Response(null, { status: 404 }),
      },
    );
    expect(result).toMatchObject({ ok: true, mime: "image/png" });
  });

  it("data: はその場で読む", async () => {
    const result = await fetchNappletResource("data:text/plain,hello", {
      fetch: async () => {
        throw new Error("should not fetch");
      },
    });
    expect(result.ok && (await result.blob.text())).toBe("hello");
  });

  // NAP-RESOURCE: > Never pass upstream `Content-Type` through.
  it("中身から種類が分からなければ、返事の Content-Type を使わず種類を名乗らない", async () => {
    const result = await fetchNappletResource("https://a.example/x", {
      fetch: async () =>
        new Response("<h1>hi</h1>", {
          headers: { "content-type": "text/html" },
        }),
    });
    expect(result).toMatchObject({
      ok: true,
      mime: "application/octet-stream",
    });
    expect(result.ok && result.blob.type).toBe("application/octet-stream");
  });

  // NAP-RESOURCE: > Raw `image/svg+xml` MUST NOT be delivered. Rasterize to PNG/WebP …
  it("SVG はそのまま渡さず、描き直した画像を渡す", async () => {
    const drawn: string[] = [];
    const result = await fetchNappletResource("https://a.example/logo.svg", {
      fetch: async () =>
        new Response(SVG, { headers: { "content-type": "image/svg+xml" } }),
      rasterizeSvg: async (bytes) => {
        drawn.push(new TextDecoder().decode(bytes));
        return new Blob([PNG], { type: "image/png" });
      },
    });
    expect(drawn).toEqual([SVG]);
    expect(result).toMatchObject({ ok: true, mime: "image/png" });
  });

  it("SVG を描き直せないときは渡さない", async () => {
    const fetch = async () => new Response(SVG);
    expect(
      await fetchNappletResource("https://a.example/logo.svg", { fetch }),
    ).toMatchObject({ ok: false, error: "decode-failed" });
    expect(
      await fetchNappletResource("https://a.example/logo.svg", {
        fetch,
        rasterizeSvg: async () => undefined,
      }),
    ).toMatchObject({ ok: false, error: "decode-failed" });
  });

  it("data: の SVG も描き直してから渡し、data: が名乗る種類は使わない", async () => {
    const fetch = async () => {
      throw new Error("should not fetch");
    };
    const svg = await fetchNappletResource(
      `data:image/svg+xml,${encodeURIComponent(SVG)}`,
      {
        fetch,
        rasterizeSvg: async () => new Blob([PNG], { type: "image/png" }),
      },
    );
    expect(svg).toMatchObject({ ok: true, mime: "image/png" });
    const disguised = await fetchNappletResource(
      `data:image/png,${encodeURIComponent(SVG)}`,
      { fetch },
    );
    expect(disguised).toMatchObject({ ok: false, error: "decode-failed" });
  });

  it("http や知らない scheme は取らない", async () => {
    const fetch = async () => new Response(PNG);
    expect(await fetchNappletResource("http://a.example/x", { fetch })).toEqual(
      {
        ok: false,
        error: "unsupported-scheme",
      },
    );
    expect(await fetchNappletResource("nostr:npub1xyz", { fetch })).toEqual({
      ok: false,
      error: "unsupported-scheme",
    });
  });
});

describe("parseBlossomUri", () => {
  it("ハッシュと、xs に添えたサーバーを https の origin で返す", () => {
    expect(
      parseBlossomUri(
        `blossom:${HASH}.png?xs=cdn.example&xs=https://b.example/path&as=abc`,
      ),
    ).toEqual({
      hash: HASH,
      servers: ["https://cdn.example", "https://b.example"],
    });
    expect(parseBlossomUri("blossom:not-a-hash")).toBeUndefined();
  });
});

describe("sniffMime", () => {
  it("先頭のバイトから画像の種類を決め、分からなければ undefined", () => {
    expect(sniffMime(PNG)).toBe("image/png");
    expect(sniffMime(new TextEncoder().encode("<svg xmlns='x'/>"))).toBe(
      "image/svg+xml",
    );
    expect(sniffMime(new TextEncoder().encode("hello"))).toBeUndefined();
  });
});
