import type { EventDraft, Mutation } from "../nostr/build/draft";
import { replaceTags } from "../nostr/build/draft";
import type { NostrEvent } from "../nostr/event";
import {
  type BlobDescriptor,
  type BlossomServer,
  UploadFailedError,
  normalizeServerUrl,
} from "./blossom";

/**
 * NIP-96 のアップロード先の一覧。NIP-96 は仕様側で非推奨（Blossom に置き換え）だが、
 * nostr.build のように NIP-96 にしか答えないサーバーがまだ使われている。
 */
export const NIP96_SERVER_LIST_KIND = 10_096;
/** HTTP の認可イベント（NIP-98）。NIP-96 のアップロードに付ける。 */
export const HTTP_AUTH_KIND = 27_235;

/** 処理が終わるのを待つ間隔と回数。動画の変換でも 1 分ほどで諦める。 */
const PROCESSING_POLL_MS = 2000;
const PROCESSING_POLL_LIMIT = 30;

export const parseNip96Servers = (
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

export const setNip96Servers =
  (servers: readonly BlossomServer[]): Mutation =>
  (current) =>
    replaceTags(current, NIP96_SERVER_LIST_KIND, "server", () =>
      servers.map((server) => ["server", server]),
    );

/**
 * アップロードしてよいことを示す認可イベント（NIP-98）。宛先の URL とファイルのハッシュを
 * 入れるので、別の宛先・別のファイルには使えない。NIP-96 は `payload` を base64 と書くが、
 * NIP-98 と実装の多く（nostr.build など）は 16 進で読む。
 */
export const buildHttpAuth = (options: {
  url: string;
  method: string;
  payloadSha256: string;
}): EventDraft => ({
  kind: HTTP_AUTH_KIND,
  content: "",
  tags: [
    ["u", options.url],
    ["method", options.method],
    ["payload", options.payloadSha256],
  ],
});

const record = (json: unknown): Record<string, unknown> | undefined =>
  json && typeof json === "object"
    ? (json as Record<string, unknown>)
    : undefined;

/** `/.well-known/nostr/nip96.json` の `api_url`。相対で書くサーバーもある。 */
export const parseNip96ApiUrl = (
  server: BlossomServer,
  json: unknown,
): string | undefined => {
  const apiUrl = record(json)?.api_url;
  if (typeof apiUrl !== "string" || apiUrl === "") return undefined;
  try {
    return new URL(apiUrl, `${server}/`).toString();
  } catch {
    return undefined;
  }
};

/** アップロードの返事（NIP-94 の形のタグ）からファイルの情報を取り出す。 */
export const parseNip96Upload = (
  json: unknown,
  original: { sha256: string; size: number },
): BlobDescriptor | undefined => {
  const tags = record(record(json)?.nip94_event)?.tags;
  if (!Array.isArray(tags)) return undefined;
  const value = (name: string): string | undefined => {
    const tag = tags.find(
      (tag): tag is string[] => Array.isArray(tag) && tag[0] === name,
    );
    return typeof tag?.[1] === "string" ? tag[1] : undefined;
  };
  const url = value("url");
  if (!url || !/^https?:\/\//.test(url)) return undefined;
  const size = Number(value("size"));
  return {
    url,
    // 投稿の imeta に書くのは、配られるファイルのハッシュ。サーバーが変換したなら
    // 元のファイル（ox）とは違う。
    sha256: value("x") ?? value("ox") ?? original.sha256,
    size: Number.isFinite(size) && size > 0 ? size : original.size,
    type: value("m"),
  };
};

const failure = async (
  server: BlossomServer,
  response: Response,
): Promise<UploadFailedError> => {
  const message = record(await response.json().catch(() => undefined))?.message;
  return new UploadFailedError(
    server,
    typeof message === "string" && message !== ""
      ? message
      : response.statusText || `${response.status}`,
    response.status,
  );
};

/**
 * 1 つの NIP-96 のサーバーへアップロードする。認可イベントは宛先が分かってから作るので、
 * 署名は呼ぶ側から関数で受け取る —— ここでは鍵に触れない。
 */
export const uploadNip96 = async (options: {
  server: BlossomServer;
  bytes: Uint8Array;
  sha256: string;
  name: string;
  type?: string;
  sign: (draft: EventDraft) => Promise<NostrEvent>;
  fetcher?: typeof fetch;
  wait?: (ms: number) => Promise<void>;
}): Promise<BlobDescriptor> => {
  const fetcher = options.fetcher ?? fetch;
  const wait =
    options.wait ??
    ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const request = async (url: string, init?: RequestInit) => {
    try {
      return await fetcher(url, init);
    } catch (cause) {
      throw new UploadFailedError(
        options.server,
        cause instanceof Error ? cause.message : String(cause),
      );
    }
  };

  const info = await request(`${options.server}/.well-known/nostr/nip96.json`);
  const apiUrl = info.ok
    ? parseNip96ApiUrl(options.server, await info.json().catch(() => undefined))
    : undefined;
  if (!apiUrl) {
    throw new UploadFailedError(
      options.server,
      "NIP-96 のアップロード先として応答しませんでした",
      info.status,
    );
  }

  const auth = await options.sign(
    buildHttpAuth({
      url: apiUrl,
      method: "POST",
      payloadSha256: options.sha256,
    }),
  );
  const form = new FormData();
  form.append(
    "file",
    new Blob([options.bytes as BlobPart], { type: options.type ?? "" }),
    options.name,
  );
  form.append("size", String(options.bytes.length));
  if (options.type) form.append("content_type", options.type);
  // 認可の入れ物は Blossom と同じく base64。中身は ASCII だけなので、そのまま btoa に通せる。
  let response = await request(apiUrl, {
    method: "POST",
    headers: { authorization: `Nostr ${btoa(JSON.stringify(auth))}` },
    body: form,
  });
  if (!response.ok) throw await failure(options.server, response);

  const original = { sha256: options.sha256, size: options.bytes.length };
  let json: unknown = await response.json().catch(() => undefined);
  // 処理待ちの間も、サーバーは元のファイルを配る（NIP-96）。URL が返っていれば待たない。
  // 待っている間の返事には processing_url が無いので、最初の返事のものを使い続ける。
  const processingUrl = record(json)?.processing_url;
  for (
    let polls = 0;
    typeof processingUrl === "string" &&
    !parseNip96Upload(json, original) &&
    record(json)?.status !== "error" &&
    polls < PROCESSING_POLL_LIMIT;
    polls++
  ) {
    await wait(PROCESSING_POLL_MS);
    response = await request(processingUrl);
    if (!response.ok) throw await failure(options.server, response);
    json = await response.json().catch(() => undefined);
  }
  const blob = parseNip96Upload(json, original);
  if (!blob) {
    const message = record(json)?.message;
    throw new UploadFailedError(
      options.server,
      typeof message === "string" && message !== ""
        ? message
        : "アップロード先の返事を読み取れませんでした",
      response.status,
    );
  }
  return blob;
};
