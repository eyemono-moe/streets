import { describe, expect, it } from "vite-plus/test";
import type { EventDraft } from "../nostr/build/draft";
import type { NostrEvent } from "../nostr/event";
import { assertNip46SignPermission } from "../signer/nip46/session-storage";
import { UploadFailedError } from "./blossom";
import {
  HTTP_AUTH_KIND,
  NIP96_SERVER_LIST_KIND,
  buildHttpAuth,
  parseNip96ApiUrl,
  parseNip96Servers,
  parseNip96Upload,
  setNip96Servers,
  uploadNip96,
} from "./nip96";

const event = (tags: string[][]): NostrEvent => ({
  id: "a".repeat(64),
  pubkey: "b".repeat(64),
  created_at: 1_700_000_000,
  kind: NIP96_SERVER_LIST_KIND,
  tags,
  content: "",
  sig: "c".repeat(128),
});

const sha = "d".repeat(64);
const bytes = new Uint8Array([1, 2, 3]);
const sign = async (draft: EventDraft): Promise<NostrEvent> => ({
  ...event([]),
  ...draft,
});

describe("NIP-96 のアップロード先の一覧（kind:10096）", () => {
  it("server タグを順番どおりに読み、末尾の / をそろえる", () => {
    expect(
      parseNip96Servers(
        event([
          ["server", "https://nostr.build/"],
          ["server", "https://b.example"],
          ["server", "https://nostr.build"],
        ]),
      ),
    ).toEqual(["https://nostr.build", "https://b.example"]);
  });

  it("書き戻すときは server タグだけを差し替える", () => {
    const draft = setNip96Servers(["https://nostr.build"])(
      event([
        ["other", "keep"],
        ["server", "https://old.example"],
      ]),
    );
    expect(draft.kind).toBe(NIP96_SERVER_LIST_KIND);
    expect(draft.tags).toEqual([
      ["server", "https://nostr.build"],
      ["other", "keep"],
    ]);
  });

  it("一覧の保存と認可は NIP-46 の要求権限に入っている", () => {
    expect(() =>
      assertNip46SignPermission(NIP96_SERVER_LIST_KIND),
    ).not.toThrow();
    expect(() => assertNip46SignPermission(HTTP_AUTH_KIND)).not.toThrow();
  });
});

describe("buildHttpAuth", () => {
  it("宛先・メソッド・ファイルのハッシュを入れた kind:27235 を作る", () => {
    expect(
      buildHttpAuth({
        url: "https://nostr.build/api/v2/nip96/upload",
        method: "POST",
        payloadSha256: sha,
      }),
    ).toEqual({
      kind: 27_235,
      content: "",
      tags: [
        ["u", "https://nostr.build/api/v2/nip96/upload"],
        ["method", "POST"],
        ["payload", sha],
      ],
    });
  });
});

describe("parseNip96ApiUrl", () => {
  it("相対の api_url はサーバーの URL から解く", () => {
    expect(
      parseNip96ApiUrl("https://nostr.download", { api_url: "/n96" }),
    ).toBe("https://nostr.download/n96");
  });

  it("api_url が空（別のサーバーへ回す設定）なら読まない", () => {
    expect(
      parseNip96ApiUrl("https://a.example", {
        api_url: "",
        delegated_to_url: "https://b.example",
      }),
    ).toBeUndefined();
  });
});

describe("parseNip96Upload", () => {
  it("変換後のハッシュ（x）を、元のハッシュ（ox）より優先する", () => {
    expect(
      parseNip96Upload(
        {
          status: "success",
          nip94_event: {
            tags: [
              ["url", "https://image.nostr.build/x.webp"],
              ["ox", "1".repeat(64)],
              ["x", "2".repeat(64)],
              ["m", "image/webp"],
              ["size", "1234"],
            ],
          },
        },
        { sha256: sha, size: 3 },
      ),
    ).toEqual({
      url: "https://image.nostr.build/x.webp",
      sha256: "2".repeat(64),
      size: 1234,
      type: "image/webp",
    });
  });

  it("url が無ければ読めない", () => {
    expect(
      parseNip96Upload(
        { nip94_event: { tags: [["ox", sha]] } },
        { sha256: sha, size: 3 },
      ),
    ).toBeUndefined();
  });
});

describe("uploadNip96", () => {
  const info = () => Response.json({ api_url: "https://n.example/api/upload" });
  const uploaded = (url = "https://cdn.n.example/a.png") =>
    Response.json({
      status: "success",
      nip94_event: {
        tags: [
          ["url", url],
          ["ox", sha],
        ],
      },
    });

  it("nip96.json の api_url へ、宛先を入れた認可を付けて multipart で送る", async () => {
    const requests: { url: string; init?: RequestInit }[] = [];
    const blob = await uploadNip96({
      server: "https://n.example",
      bytes,
      sha256: sha,
      name: "a.png",
      type: "image/png",
      sign,
      fetcher: (async (url: string, init?: RequestInit) => {
        requests.push({ url, init });
        return url.endsWith("nip96.json") ? info() : uploaded();
      }) as unknown as typeof fetch,
    });
    expect(blob).toEqual({
      url: "https://cdn.n.example/a.png",
      sha256: sha,
      size: 3,
      type: undefined,
    });
    const post = requests[1];
    if (!post?.init) throw new Error("アップロードを送っていない");
    expect(post.url).toBe("https://n.example/api/upload");
    expect(post.init.method).toBe("POST");
    const header = (post.init.headers as Record<string, string>).authorization;
    const auth = JSON.parse(atob(header?.replace(/^Nostr /, "") ?? ""));
    expect(auth.kind).toBe(27_235);
    expect(auth.tags).toContainEqual(["u", "https://n.example/api/upload"]);
    expect(auth.tags).toContainEqual(["payload", sha]);
    const form = post.init.body as FormData;
    expect(form.get("file")).toBeInstanceOf(Blob);
    expect(form.get("content_type")).toBe("image/png");
  });

  it("URL がまだ無い処理待ちの返事なら、processing_url を待つ", async () => {
    let polls = 0;
    const blob = await uploadNip96({
      server: "https://n.example",
      bytes,
      sha256: sha,
      name: "a.mp4",
      sign,
      wait: async () => {},
      fetcher: (async (url: string) => {
        if (url.endsWith("nip96.json")) return info();
        if (url === "https://n.example/api/upload") {
          return Response.json(
            { status: "processing", processing_url: "https://n.example/p/1" },
            { status: 202 },
          );
        }
        polls++;
        return polls < 2
          ? Response.json({ status: "processing", percentage: 50 })
          : uploaded("https://cdn.n.example/a.mp4");
      }) as unknown as typeof fetch,
    });
    expect(polls).toBe(2);
    expect(blob.url).toBe("https://cdn.n.example/a.mp4");
  });

  it("断られたら、返事の message を理由にして投げる", async () => {
    await expect(
      uploadNip96({
        server: "https://n.example",
        bytes,
        sha256: sha,
        name: "a.png",
        sign,
        fetcher: (async (url: string) =>
          url.endsWith("nip96.json")
            ? info()
            : Response.json(
                { status: "error", message: "file too large" },
                { status: 413 },
              )) as unknown as typeof fetch,
      }),
    ).rejects.toMatchObject({
      name: "UploadFailedError",
      message: "file too large",
      status: 413,
    });
  });

  it("nip96.json が無ければ、署名する前に投げる", async () => {
    let signed = false;
    await expect(
      uploadNip96({
        server: "https://n.example",
        bytes,
        sha256: sha,
        name: "a.png",
        sign: async (draft) => {
          signed = true;
          return sign(draft);
        },
        fetcher: (async () =>
          new Response("", { status: 404 })) as unknown as typeof fetch,
      }),
    ).rejects.toBeInstanceOf(UploadFailedError);
    expect(signed).toBe(false);
  });
});
