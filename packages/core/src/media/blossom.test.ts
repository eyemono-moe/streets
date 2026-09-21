import { describe, expect, it } from "vitest";
import type { NostrEvent } from "../nostr/event";
import {
  DEFAULT_BLOSSOM_SERVERS,
  UploadFailedError,
  buildUploadAuth,
  effectiveBlossomServers,
  hashBytes,
  normalizeServerUrl,
  parseBlossomServers,
  parseServerInput,
  setBlossomServers,
  uploadBlob,
} from "./blossom";

const event = (tags: string[][]): NostrEvent => ({
  id: "a".repeat(64),
  pubkey: "b".repeat(64),
  created_at: 1_700_000_000,
  kind: 10_063,
  tags,
  content: "",
  sig: "c".repeat(128),
});

const signedAuth: NostrEvent = {
  ...event([]),
  kind: 24_242,
  content: "画像.png をアップロードします",
};

const bytes = new Uint8Array([1, 2, 3]);

describe("預け先の一覧（kind:10063）", () => {
  it("server タグを順番どおりに読み、末尾の / をそろえる", () => {
    expect(
      parseBlossomServers(
        event([
          ["server", "https://a.example/"],
          ["other", "x"],
          ["server", "https://b.example"],
          ["server", "https://a.example"],
        ]),
      ),
    ).toEqual(["https://a.example", "https://b.example"]);
  });

  it("一覧が無ければ空", () => {
    expect(parseBlossomServers(undefined)).toEqual([]);
  });

  it("書き戻すときは server タグだけを差し替える", () => {
    const draft = setBlossomServers(["https://a.example"])(
      event([
        ["other", "keep"],
        ["server", "https://old.example"],
      ]),
    );
    expect(draft.tags).toEqual([
      ["server", "https://a.example"],
      ["other", "keep"],
    ]);
    expect(draft.kind).toBe(10_063);
  });
});

describe("effectiveBlossomServers", () => {
  it("まだ決めていない（一覧が無い）人には既定を使う", () => {
    expect(effectiveBlossomServers(undefined)).toEqual(DEFAULT_BLOSSOM_SERVERS);
  });

  it("空の一覧を保存した人には既定を使わない（自分で決めた状態）", () => {
    expect(effectiveBlossomServers(event([]))).toEqual([]);
  });

  it("決めている人はその一覧", () => {
    expect(
      effectiveBlossomServers(event([["server", "https://a.example"]])),
    ).toEqual(["https://a.example"]);
  });
});

describe("parseServerInput", () => {
  it("https:// を省いても補う", () => {
    expect(parseServerInput("blossom.example", [])).toEqual({
      ok: true,
      url: "https://blossom.example",
    });
  });

  it("空・URL でない・もう入っているものは断る", () => {
    expect(parseServerInput("   ", []).ok).toBe(false);
    expect(parseServerInput("javascript:alert(1)", []).ok).toBe(false);
    expect(
      parseServerInput("https://a.example/", ["https://a.example"]),
    ).toMatchObject({ ok: false, message: "この預け先はもう入っています" });
  });

  it("normalizeServerUrl は末尾の / と検索文字列を落とす", () => {
    expect(normalizeServerUrl("https://a.example/?x=1#y")).toBe(
      "https://a.example",
    );
  });
});

describe("buildUploadAuth", () => {
  it("中身のハッシュと期限を入れた kind:24242 を作る", () => {
    const draft = buildUploadAuth({
      sha256: "f".repeat(64),
      name: "画像.png",
      nowSeconds: 1000,
      ttlSeconds: 60,
    });
    expect(draft.kind).toBe(24_242);
    expect(draft.tags).toEqual([
      ["t", "upload"],
      ["x", "f".repeat(64)],
      ["expiration", "1060"],
    ]);
  });
});

describe("uploadBlob", () => {
  const okResponse = (body: unknown) =>
    new Response(JSON.stringify(body), { status: 200 });

  it("PUT /upload に認可ヘッダーと中身を送り、返事を読む", async () => {
    let seen: { url?: string; init?: RequestInit } = {};
    const blob = await uploadBlob({
      server: "https://a.example",
      bytes,
      type: "image/png",
      auth: signedAuth,
      fetcher: (async (url: string, init?: RequestInit) => {
        seen = { url, init };
        return okResponse({
          url: "https://a.example/abc.png",
          sha256: "f".repeat(64),
          size: 3,
          type: "image/png",
        });
      }) as unknown as typeof fetch,
    });

    expect(seen.url).toBe("https://a.example/upload");
    expect(seen.init?.method).toBe("PUT");
    const authorization = (seen.init?.headers as Record<string, string>)
      .authorization;
    expect(authorization.startsWith("Nostr ")).toBe(true);
    // base64url で送る（`+` `/` `=` を含まない）。ふつうの base64 を base64url
    // として読む預け先があり、中身が壊れて「署名が違う」と断られる。
    const encoded = authorization.slice("Nostr ".length);
    expect(encoded).not.toMatch(/[+/=]/);
    expect(
      JSON.parse(atob(encoded.replace(/-/g, "+").replace(/_/g, "/"))),
    ).toMatchObject({ kind: 24_242 });
    expect(blob).toEqual({
      url: "https://a.example/abc.png",
      sha256: "f".repeat(64),
      size: 3,
      type: "image/png",
    });
  });

  it("sha256 を返さないサーバーでも、こちらで数えた値を使う", async () => {
    const blob = await uploadBlob({
      server: "https://a.example",
      bytes,
      auth: signedAuth,
      fetcher: (async () =>
        okResponse({
          url: "https://a.example/abc",
        })) as unknown as typeof fetch,
    });
    expect(blob.sha256).toBe(hashBytes(bytes));
  });

  it("断られたら理由（X-Reason）を添えて投げる", async () => {
    await expect(
      uploadBlob({
        server: "https://a.example",
        bytes,
        auth: signedAuth,
        fetcher: (async () =>
          new Response("", {
            status: 413,
            headers: { "x-reason": "file too large" },
          })) as unknown as typeof fetch,
      }),
    ).rejects.toMatchObject({
      name: "UploadFailedError",
      message: "file too large",
      status: 413,
    });
  });

  it("返事が読めなければ投げる", async () => {
    await expect(
      uploadBlob({
        server: "https://a.example",
        bytes,
        auth: signedAuth,
        fetcher: (async () =>
          okResponse({ nope: true })) as unknown as typeof fetch,
      }),
    ).rejects.toBeInstanceOf(UploadFailedError);
  });
});
