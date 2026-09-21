import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import {
  type EventDraft,
  type Mutation,
  replaceTags,
} from "../nostr/build/draft";
import type { NostrEvent } from "../nostr/event";

/**
 * 画像などのファイルのアップロード先（Blossom。NIP-B7 / BUD-01〜03）。ファイルは中身の
 * SHA-256 で指すので、同じファイルはどのサーバーでも同じ名前になり、1 つのサーバーが
 * 落ちても別のサーバーから同じものを取れる。
 */
export const BLOSSOM_SERVER_LIST_KIND = 10_063;
/** アップロードするときの認可イベント（BUD-01）。 */
export const BLOSSOM_AUTH_KIND = 24_242;

/** 認可イベントの有効期間。短くしておく（奪われても使える時間を短くする）。 */
const AUTH_TTL_SECONDS = 300;

/** 末尾の `/` を落とした https の URL。比較と表示を 1 つの形にそろえる。 */
export type BlossomServer = string;

/**
 * 自分で決めていない人が最初から画像を投稿できるようにするためのアップロード先。上から順に
 * 試す。2026-09-21 に、どれも `PUT /upload` を受け付け（認可が無ければ 401）、
 * ブラウザから使えること（CORS が `*` で `Authorization` を許す）を確かめた。
 * 運営者・保存期間・容量の決まりはサーバーごとに違うので、設定から変えられる。
 */
export const DEFAULT_BLOSSOM_SERVERS: readonly BlossomServer[] = [
  "https://blossom.band",
  "https://nostr.download",
  "https://blossom.primal.net",
];

export const normalizeServerUrl = (
  input: string,
): BlossomServer | undefined => {
  let parsed: URL;
  try {
    parsed = new URL(input.trim());
  } catch {
    return undefined;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return undefined;
  }
  parsed.search = "";
  parsed.hash = "";
  return parsed.toString().replace(/\/$/, "");
};

/** kind:10063 の `server` タグ（BUD-03）。並び順が優先順（先頭からアップロードする）。 */
export const parseBlossomServers = (
  event: NostrEvent | undefined,
): BlossomServer[] => {
  if (!event) return [];
  const servers: BlossomServer[] = [];
  for (const tag of event.tags) {
    if (tag[0] !== "server") continue;
    const url = tag[1] === undefined ? undefined : normalizeServerUrl(tag[1]);
    if (url && !servers.includes(url)) servers.push(url);
  }
  return servers;
};

/**
 * 実際にアップロードしに行く先。まだ自分で決めていない（kind:10063 が無い）ときは既定を使う。
 * 空の一覧を保存した人には既定を使わない —— 自分で「どこにもアップロードしない」と決めた状態。
 */
export const effectiveBlossomServers = (
  event: NostrEvent | undefined,
): readonly BlossomServer[] =>
  event === undefined ? DEFAULT_BLOSSOM_SERVERS : parseBlossomServers(event);

export const setBlossomServers =
  (servers: readonly BlossomServer[]): Mutation =>
  (current) =>
    replaceTags(current, BLOSSOM_SERVER_LIST_KIND, "server", () =>
      servers.map((server) => ["server", server]),
    );

export type ServerInputResult =
  | { ok: true; url: BlossomServer }
  | { ok: false; message: string };

/** 入力されたアップロード先の URL を確かめる。`https://` を省いて打つ人が多いので補う。 */
export const parseServerInput = (
  input: string,
  existing: readonly BlossomServer[],
): ServerInputResult => {
  const text = input.trim();
  if (text === "" || text === "https://") {
    return { ok: false, message: "アップロード先の URL を入力してください" };
  }
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(text)
    ? text
    : `https://${text}`;
  const url = normalizeServerUrl(withScheme);
  if (!url) {
    return {
      ok: false,
      message: "https:// で始まる URL を入力してください",
    };
  }
  if (existing.includes(url)) {
    return { ok: false, message: "このアップロード先はもう入っています" };
  }
  return { ok: true, url };
};

/** アップロードしたファイル（BUD-02 の blob descriptor）。 */
export type BlobDescriptor = {
  url: string;
  sha256: string;
  size: number;
  type?: string;
};

export class UploadFailedError extends Error {
  readonly server: BlossomServer;
  readonly status?: number;
  constructor(server: BlossomServer, message: string, status?: number) {
    super(message);
    this.name = "UploadFailedError";
    this.server = server;
    this.status = status;
  }
}

export const hashBytes = (bytes: Uint8Array): string =>
  bytesToHex(sha256(bytes));

/**
 * アップロードしてよいことを示す認可イベント（BUD-01 の kind:24242）。ファイルの中身の
 * ハッシュを入れるので、この 1 つの認可で別のファイルはアップロードできない。
 */
export const buildUploadAuth = (options: {
  sha256: string;
  name: string;
  nowSeconds: number;
  ttlSeconds?: number;
}): EventDraft => ({
  kind: BLOSSOM_AUTH_KIND,
  content: `${options.name} をアップロードします`,
  tags: [
    ["t", "upload"],
    ["x", options.sha256],
    [
      "expiration",
      String(options.nowSeconds + (options.ttlSeconds ?? AUTH_TTL_SECONDS)),
    ],
  ],
});

/**
 * 認可イベントの入れ物（BUD-11）。ふつうの base64 ではなく base64url（JWT と
 * 同じ形）で送る —— `+` `/` を含む base64 を base64url として読むアップロード先があり、
 * 中身が壊れて「署名が違う」と断られる。
 */
const base64url = (text: string): string =>
  btoa(String.fromCharCode(...new TextEncoder().encode(text)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

const parseBlob = (
  json: unknown,
  fallbackHash: string,
): BlobDescriptor | undefined => {
  if (!json || typeof json !== "object") return undefined;
  const record = json as Record<string, unknown>;
  const url = record.url;
  if (typeof url !== "string" || !/^https?:\/\//.test(url)) return undefined;
  return {
    url,
    sha256: typeof record.sha256 === "string" ? record.sha256 : fallbackHash,
    size: typeof record.size === "number" ? record.size : 0,
    type: typeof record.type === "string" ? record.type : undefined,
  };
};

/**
 * 1 つのサーバーへアップロードする（BUD-02 の `PUT /upload`）。認可イベントは署名済みのものを
 * 受け取る —— 署名はアプリの署名器の仕事で、ここでは鍵に触れない。
 */
export const uploadBlob = async (options: {
  server: BlossomServer;
  bytes: Uint8Array;
  type?: string;
  auth: NostrEvent;
  fetcher?: typeof fetch;
  signal?: AbortSignal;
}): Promise<BlobDescriptor> => {
  const fetcher = options.fetcher ?? fetch;
  const authorization = `Nostr ${base64url(JSON.stringify(options.auth))}`;
  let response: Response;
  try {
    response = await fetcher(`${options.server}/upload`, {
      method: "PUT",
      headers: {
        authorization,
        ...(options.type ? { "content-type": options.type } : {}),
      },
      // Uint8Array をそのまま body にできる（ArrayBufferView）。
      body: options.bytes as BodyInit,
      signal: options.signal,
    });
  } catch (cause) {
    throw new UploadFailedError(
      options.server,
      cause instanceof Error ? cause.message : String(cause),
    );
  }
  if (!response.ok) {
    // BUD-01 はエラーの説明を `X-Reason` に入れると定めている。
    const reason = response.headers.get("x-reason") ?? response.statusText;
    throw new UploadFailedError(
      options.server,
      reason || `${response.status}`,
      response.status,
    );
  }
  const blob = parseBlob(
    await response.json().catch(() => undefined),
    hashBytes(options.bytes),
  );
  if (!blob) {
    throw new UploadFailedError(
      options.server,
      "アップロード先の返事を読み取れませんでした",
      response.status,
    );
  }
  return blob;
};
